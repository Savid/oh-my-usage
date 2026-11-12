// Package monitor polls an omp gateway (and broker, when there is one), keeps
// the latest accounts, records their usage and pauses accounts.
package monitor

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/accounts"
)

const (
	// pollTimeout bounds one poll: its gateway and broker requests.
	pollTimeout = 30 * time.Second
	// pruneEvery is how often old samples are deleted.
	pruneEvery = time.Hour
)

// Errors SetPaused returns for a request it cannot act on.
var (
	ErrNoBroker       = errors.New("no broker is configured")
	ErrUnknownAccount = errors.New("no such account")
	ErrNotPausable    = errors.New("the account has no broker credential")
)

// Gateway is what the monitor reads from an omp auth gateway.
type Gateway interface {
	Usage(ctx context.Context) ([]accounts.Report, error)
	Version(ctx context.Context) (string, error)
}

// Broker is what the monitor reads from and changes on an omp auth broker.
type Broker interface {
	Credentials(ctx context.Context) ([]accounts.Credential, error)
	SetBlock(ctx context.Context, credentialID int64, providerKey, scope string, until time.Time) error
	DeleteBlock(ctx context.Context, credentialID int64, providerKey, scope string) error
}

// Recorder stores usage samples.
type Recorder interface {
	Record(ctx context.Context, samples []store.Sample) error
	Prune(ctx context.Context, before time.Time) (int64, error)
}

// Config holds what a Monitor needs.
type Config struct {
	Gateway Gateway
	// Broker is nil when none is configured: accounts then cannot be paused.
	Broker   Broker
	Recorder Recorder
	// Interval is the time between polls.
	Interval time.Duration
	// Retention is how long samples are kept; zero keeps them forever.
	Retention time.Duration
	// Now returns the current time; nil takes time.Now. Tests set it.
	Now func() time.Time
}

// Source is the health of the gateway or the broker.
type Source struct {
	// Reachable is whether the last poll of it succeeded.
	Reachable bool
	// Err is why the last poll failed; empty when it succeeded.
	Err string
	// UpdatedAt is the last successful poll; zero before the first.
	UpdatedAt time.Time
}

// State is what the last polls found. While a source is unreachable its last
// good data stays in Accounts.
type State struct {
	Accounts       []accounts.Account
	Gateway        Source
	GatewayVersion string
	// Broker is nil when none is configured.
	Broker *Source
}

// Monitor owns the poll loop and the latest State.
type Monitor struct {
	log *slog.Logger
	cfg Config

	// polling serialises polls: the ticker's and those a pause triggers.
	polling     sync.Mutex
	reports     []accounts.Report
	credentials []accounts.Credential
	prunedAt    time.Time

	mu          sync.Mutex
	state       State
	subscribers map[chan struct{}]struct{}
}

// New returns a Monitor that has not polled yet.
func New(log *slog.Logger, cfg Config) *Monitor {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	m := &Monitor{log: log, cfg: cfg, subscribers: map[chan struct{}]struct{}{}}
	if cfg.Broker != nil {
		m.state.Broker = &Source{}
	}

	return m
}

// Controls reports whether accounts can be paused.
func (m *Monitor) Controls() bool { return m.cfg.Broker != nil }

// Run polls once, then every Interval, until ctx is cancelled.
func (m *Monitor) Run(ctx context.Context) {
	m.Refresh(ctx)

	ticker := time.NewTicker(m.cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.Refresh(ctx)
		}
	}
}

// State returns the latest state. The caller must not change its slices.
func (m *Monitor) State() State {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.state
}

// Subscribe returns a channel that receives after each poll, and a function
// that ends the subscription. A slow reader misses polls, never blocks one.
func (m *Monitor) Subscribe() (changed <-chan struct{}, cancel func()) {
	ch := make(chan struct{}, 1)

	m.mu.Lock()
	m.subscribers[ch] = struct{}{}
	m.mu.Unlock()

	return ch, func() {
		m.mu.Lock()
		delete(m.subscribers, ch)
		m.mu.Unlock()
	}
}

// SetPaused pauses or resumes an account and returns it as the broker then
// reports it. A pause is a block in omp's account-policy scope: omp moves
// traffic off the account within seconds, but still falls back to it when
// every other account of the provider is blocked or exhausted.
func (m *Monitor) SetPaused(ctx context.Context, accountID string, paused bool) (accounts.Account, error) {
	if m.cfg.Broker == nil {
		return accounts.Account{}, ErrNoBroker
	}

	account, ok := m.account(accountID)
	if !ok {
		return accounts.Account{}, ErrUnknownAccount
	}

	if !account.Pausable() {
		return accounts.Account{}, ErrNotPausable
	}

	if err := m.setBlock(ctx, account, paused); err != nil {
		return accounts.Account{}, err
	}

	m.Refresh(ctx)

	if broker := m.State().Broker; !broker.Reachable {
		return accounts.Account{}, fmt.Errorf("read the broker after the change: %s", broker.Err)
	}

	account, ok = m.account(accountID)
	if !ok {
		return accounts.Account{}, ErrUnknownAccount
	}

	m.log.InfoContext(ctx, "account pause changed", "account", accountID, "provider", account.Provider, "paused", account.Paused)

	return account, nil
}

func (m *Monitor) setBlock(ctx context.Context, account accounts.Account, paused bool) error {
	if paused {
		err := m.cfg.Broker.SetBlock(ctx, account.CredentialID, account.ProviderKey(), accounts.PauseScope, accounts.PausedUntil())
		if err != nil {
			return fmt.Errorf("pause: %w", err)
		}

		return nil
	}

	// omp sets short blocks of its own in the same scope. Only a pause may be
	// deleted, so check the broker's current view first.
	credentials, err := m.cfg.Broker.Credentials(ctx)
	if err != nil {
		return fmt.Errorf("resume: %w", err)
	}

	for _, c := range credentials {
		if c.ID != account.CredentialID || !c.Paused(m.cfg.Now()) {
			continue
		}

		if err = m.cfg.Broker.DeleteBlock(ctx, account.CredentialID, account.ProviderKey(), accounts.PauseScope); err != nil {
			return fmt.Errorf("resume: %w", err)
		}
	}

	return nil
}

func (m *Monitor) account(id string) (accounts.Account, bool) {
	for _, a := range m.State().Accounts {
		if a.ID == id {
			return a, true
		}
	}

	return accounts.Account{}, false
}

// Refresh reads the gateway and the broker, publishes the merged state and
// records the usage. A source that fails keeps its last good data.
func (m *Monitor) Refresh(ctx context.Context) {
	m.polling.Lock()
	defer m.polling.Unlock()

	ctx, cancel := context.WithTimeout(ctx, pollTimeout)
	defer cancel()

	now := m.cfg.Now()
	previous := m.State()
	next := State{Gateway: previous.Gateway, GatewayVersion: previous.GatewayVersion}

	fresh, err := m.pollGateway(ctx)
	next.Gateway = m.settle(ctx, "gateway", previous.Gateway, err, now)

	if err == nil {
		if version, versionErr := m.cfg.Gateway.Version(ctx); versionErr == nil {
			next.GatewayVersion = version
		}
	}

	if m.cfg.Broker != nil {
		credentials, brokerErr := m.cfg.Broker.Credentials(ctx)
		if brokerErr == nil {
			m.credentials = credentials
		}

		broker := m.settle(ctx, "broker", *previous.Broker, brokerErr, now)
		next.Broker = &broker
	}

	next.Accounts = accounts.Merge(m.reports, m.credentials, now)

	m.mu.Lock()
	m.state = next

	for ch := range m.subscribers {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	m.mu.Unlock()

	if fresh {
		m.record(ctx, next.Accounts, now)
	}
}

// pollGateway refreshes the usage reports and says whether it did.
func (m *Monitor) pollGateway(ctx context.Context) (bool, error) {
	reports, err := m.cfg.Gateway.Usage(ctx)
	if err != nil {
		return false, err
	}

	// The gateway answers an empty list when its broker is down. Accounts do
	// not vanish between polls, so keep the last good reports.
	if len(reports) == 0 && len(m.reports) > 0 {
		return false, errors.New("the gateway returned no usage reports")
	}

	m.reports = reports

	return true, nil
}

// settle turns a poll's outcome into the source's health, logging only when
// it changes.
func (m *Monitor) settle(ctx context.Context, name string, previous Source, err error, now time.Time) Source {
	if err == nil {
		if previous.Err != "" {
			m.log.InfoContext(ctx, "source reachable again", "source", name)
		}

		return Source{Reachable: true, UpdatedAt: now.UTC()}
	}

	if previous.Err != err.Error() {
		m.log.WarnContext(ctx, "source unreachable", "source", name, "error", err)
	}

	return Source{Err: err.Error(), UpdatedAt: previous.UpdatedAt}
}

// record stores a sample for every limit that reports an amount, and prunes
// old samples now and then.
func (m *Monitor) record(ctx context.Context, list []accounts.Account, now time.Time) {
	var samples []store.Sample

	for _, a := range list {
		if a.FetchedAt.IsZero() {
			continue
		}

		for _, l := range a.Limits {
			if l.UsedFraction == nil {
				continue
			}

			samples = append(samples, store.Sample{
				AccountID: a.ID, LimitID: l.ID, At: a.FetchedAt, Provider: a.Provider,
				Label: l.Label, UsedFraction: *l.UsedFraction, Status: l.Status, ResetsAt: l.ResetsAt,
			})
		}
	}

	if err := m.cfg.Recorder.Record(ctx, samples); err != nil {
		m.log.WarnContext(ctx, "record usage", "error", err)
	}

	if m.cfg.Retention <= 0 || now.Sub(m.prunedAt) < pruneEvery {
		return
	}

	m.prunedAt = now

	if n, err := m.cfg.Recorder.Prune(ctx, now.Add(-m.cfg.Retention)); err != nil {
		m.log.WarnContext(ctx, "prune usage", "error", err)
	} else if n > 0 {
		m.log.InfoContext(ctx, "pruned old usage samples", "count", n)
	}
}

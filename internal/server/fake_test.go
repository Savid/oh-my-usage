package server

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/savid/oh-my-usage/internal/monitor"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/accounts"
)

// Account IDs the fakes know.
const (
	seatID  = "00000000000000a1"
	strayID = "00000000000000a2"
)

// testState is two accounts: a seat with a broker credential, and one the
// gateway reports that the broker does not hold.
func testState() monitor.State {
	return monitor.State{
		Accounts: []accounts.Account{
			{
				ID: seatID, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "one@example.com",
				OrgName: "One Org", Plan: "max", CredentialID: 1,
				BlockedUntil: testNow.Add(time.Hour),
				Limits: []accounts.Limit{
					{
						ID: "anthropic:7d", Label: "Claude 7 Day", WindowLabel: "7 Day",
						UsedFraction: new(0.76), Status: "ok", ResetsAt: testNow.Add(21 * time.Hour),
					},
					{ID: "anthropic:5h", Label: "Claude 5 Hour", Status: "brand-new-status"},
				},
				Resets:    &accounts.Resets{Available: 2, Usable: new(1), SoonestExpiresAt: testNow.Add(720 * time.Hour)},
				FetchedAt: testNow.Add(-time.Minute),
			},
			{ID: strayID, Provider: "opencode-go", Limits: nil},
		},
		Gateway:        monitor.Source{Reachable: true, UpdatedAt: testNow},
		GatewayVersion: "18.19.0",
		Broker:         &monitor.Source{Err: "connection refused", UpdatedAt: testNow.Add(-time.Hour)},
	}
}

type fakeMonitor struct {
	mu       sync.Mutex
	state    monitor.State
	controls bool
	// pauseErr, when set, is what SetPaused returns.
	pauseErr error
	changed  chan struct{}
}

func newFakeMonitor() *fakeMonitor {
	return &fakeMonitor{state: testState(), controls: true, changed: make(chan struct{}, 1)}
}

func (m *fakeMonitor) State() monitor.State {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.state
}

func (m *fakeMonitor) Controls() bool { return m.controls }

func (m *fakeMonitor) Subscribe() (changed <-chan struct{}, cancel func()) {
	return m.changed, func() {}
}

func (m *fakeMonitor) SetPaused(_ context.Context, accountID string, paused bool) (accounts.Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.pauseErr != nil {
		return accounts.Account{}, m.pauseErr
	}

	for i := range m.state.Accounts {
		a := &m.state.Accounts[i]
		if a.ID != accountID {
			continue
		}

		if !a.Pausable() {
			return accounts.Account{}, monitor.ErrNotPausable
		}

		a.Paused = paused

		return *a, nil
	}

	return accounts.Account{}, monitor.ErrUnknownAccount
}

type fakeHistory struct {
	mu      sync.Mutex
	samples []store.Sample
	trends  []store.Trend
	err     error
	// since and until are the bounds of the last read; steps its thinning.
	since, until time.Time
	steps        int
}

func (h *fakeHistory) Trends(_ context.Context, since, until time.Time, steps int) ([]store.Trend, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.since, h.until, h.steps = since, until, steps

	if h.err != nil {
		return nil, h.err
	}

	return h.trends, nil
}

func (h *fakeHistory) History(_ context.Context, accountID string, since time.Time) ([]store.Sample, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.since = since

	if h.err != nil {
		return nil, h.err
	}

	if accountID != seatID {
		return []store.Sample{}, nil
	}

	return h.samples, nil
}

var errBoom = errors.New("boom")

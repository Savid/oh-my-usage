package monitor_test

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/internal/monitor"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/accounts"
)

var t0 = time.Date(2026, time.November, 13, 9, 0, 0, 0, time.UTC)

type fakeGateway struct {
	mu      sync.Mutex
	reports []accounts.Report
	err     error
	version string
}

func (g *fakeGateway) Usage(context.Context) ([]accounts.Report, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	return g.reports, g.err
}

func (g *fakeGateway) Version(context.Context) (string, error) { return g.version, nil }

func (g *fakeGateway) set(reports []accounts.Report, err error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.reports, g.err = reports, err
}

// fakeBroker keeps blocks the way the real one does: one per credential and scope.
type fakeBroker struct {
	credentials []accounts.Credential
	err         error
	calls       []string
}

func (b *fakeBroker) Credentials(context.Context) ([]accounts.Credential, error) {
	if b.err != nil {
		return nil, b.err
	}

	return append([]accounts.Credential(nil), b.credentials...), nil
}

func (b *fakeBroker) SetBlock(_ context.Context, id int64, providerKey, scope string, until time.Time) error {
	b.calls = append(b.calls, "set "+providerKey+" "+scope)

	for i := range b.credentials {
		if b.credentials[i].ID == id {
			b.credentials[i].Blocks = append(b.credentials[i].Blocks, accounts.Block{Scope: scope, Until: until})
		}
	}

	return nil
}

func (b *fakeBroker) DeleteBlock(_ context.Context, id int64, providerKey, scope string) error {
	b.calls = append(b.calls, "delete "+providerKey+" "+scope)

	for i := range b.credentials {
		if b.credentials[i].ID != id {
			continue
		}

		var kept []accounts.Block

		for _, block := range b.credentials[i].Blocks {
			if block.Scope != scope {
				kept = append(kept, block)
			}
		}

		b.credentials[i].Blocks = kept
	}

	return nil
}

type fakeRecorder struct {
	samples []store.Sample
	pruned  []time.Time
	err     error
}

func (r *fakeRecorder) Record(_ context.Context, samples []store.Sample) error {
	r.samples = append(r.samples, samples...)

	return r.err
}

func (r *fakeRecorder) Prune(_ context.Context, before time.Time) (int64, error) {
	r.pruned = append(r.pruned, before)

	return 1, nil
}

func reports() []accounts.Report {
	return []accounts.Report{
		{
			Provider: "anthropic", FetchedAt: t0.Add(-time.Minute), Email: "one@example.com", OrgID: "org-1",
			Limits: []accounts.Limit{
				{ID: "anthropic:7d", Label: "Claude 7 Day", UsedFraction: new(0.76), Status: "ok", ResetsAt: t0.Add(21 * time.Hour)},
				{ID: "anthropic:5h", Label: "Claude 5 Hour"},
			},
		},
		{Provider: "anthropic", FetchedAt: t0.Add(-time.Minute), Email: "two@example.com", OrgID: "org-2"},
	}
}

func credentials() []accounts.Credential {
	return []accounts.Credential{
		{ID: 1, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "one@example.com", OrgID: "org-1"},
		{ID: 6, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "two@example.com", OrgID: "org-2"},
	}
}

type rig struct {
	gateway  *fakeGateway
	broker   *fakeBroker
	recorder *fakeRecorder
	now      time.Time
	monitor  *monitor.Monitor
}

func newRig(t *testing.T, withBroker bool) *rig {
	t.Helper()

	r := &rig{
		gateway:  &fakeGateway{reports: reports(), version: "18.19.0"},
		recorder: &fakeRecorder{},
		now:      t0,
	}
	cfg := monitor.Config{
		Gateway: r.gateway, Recorder: r.recorder, Interval: time.Hour, Retention: 24 * time.Hour,
		Now: func() time.Time { return r.now },
	}

	if withBroker {
		r.broker = &fakeBroker{credentials: credentials()}
		cfg.Broker = r.broker
	}

	r.monitor = monitor.New(slog.New(slog.DiscardHandler), cfg)

	return r
}

func find(t *testing.T, state monitor.State, email string) accounts.Account {
	t.Helper()

	for _, a := range state.Accounts {
		if a.Email == email {
			return a
		}
	}

	t.Fatalf("no account %q", email)

	return accounts.Account{}
}

func TestRefreshWithoutBroker(t *testing.T) {
	t.Parallel()

	r := newRig(t, false)
	if r.monitor.Controls() {
		t.Error("Controls() = true without a broker")
	}

	if got := r.monitor.State(); got.Gateway.Reachable || got.Broker != nil || len(got.Accounts) != 0 {
		t.Errorf("state before the first poll: %+v", got)
	}

	r.monitor.Refresh(context.Background())

	got := r.monitor.State()
	if !got.Gateway.Reachable || !got.Gateway.UpdatedAt.Equal(t0) || got.GatewayVersion != "18.19.0" || got.Broker != nil {
		t.Errorf("state: %+v", got)
	}

	if len(got.Accounts) != 2 || find(t, got, "one@example.com").Pausable() {
		t.Errorf("accounts: %+v", got.Accounts)
	}

	// Only limits that report an amount are recorded, at the provider's time.
	if len(r.recorder.samples) != 1 {
		t.Fatalf("recorded %d samples, want 1: %+v", len(r.recorder.samples), r.recorder.samples)
	}

	sample := r.recorder.samples[0]
	if sample.AccountID != find(t, got, "one@example.com").ID || sample.LimitID != "anthropic:7d" ||
		!sample.At.Equal(t0.Add(-time.Minute)) || sample.UsedFraction != 0.76 || !sample.ResetsAt.Equal(t0.Add(21*time.Hour)) {
		t.Errorf("sample: %+v", sample)
	}
}

func TestGatewayFailureKeepsLastGoodData(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, false)
	r.monitor.Refresh(ctx)

	for name, fail := range map[string]func(){
		"error":         func() { r.gateway.set(nil, errors.New("connection refused")) },
		"empty reports": func() { r.gateway.set([]accounts.Report{}, nil) },
	} {
		fail()

		r.now = t0.Add(time.Minute)
		recorded := len(r.recorder.samples)
		r.monitor.Refresh(ctx)

		got := r.monitor.State()
		if got.Gateway.Reachable || got.Gateway.Err == "" || !got.Gateway.UpdatedAt.Equal(t0) {
			t.Errorf("%s: gateway = %+v, want unreachable since t0", name, got.Gateway)
		}

		if len(got.Accounts) != 2 || got.GatewayVersion != "18.19.0" {
			t.Errorf("%s: last good data dropped: %+v", name, got)
		}

		if len(r.recorder.samples) != recorded {
			t.Errorf("%s: stale data was recorded again", name)
		}
	}

	r.gateway.set(reports(), nil)
	r.now = t0.Add(2 * time.Minute)
	r.monitor.Refresh(ctx)

	if got := r.monitor.State().Gateway; !got.Reachable || got.Err != "" || !got.UpdatedAt.Equal(r.now) {
		t.Errorf("after recovery: %+v", got)
	}
}

func TestEmptyFirstPollIsNotAnError(t *testing.T) {
	t.Parallel()

	r := newRig(t, false)
	r.gateway.set([]accounts.Report{}, nil)
	r.monitor.Refresh(context.Background())

	if got := r.monitor.State(); !got.Gateway.Reachable || len(got.Accounts) != 0 {
		t.Errorf("state: %+v", got)
	}
}

func TestBrokerFailureKeepsLastGoodCredentials(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, true)
	r.monitor.Refresh(ctx)

	if got := r.monitor.State(); !got.Broker.Reachable || !find(t, got, "one@example.com").Pausable() {
		t.Fatalf("state: %+v", got)
	}

	r.broker.err = errors.New("broker down")
	r.monitor.Refresh(ctx)

	got := r.monitor.State()
	if got.Broker.Reachable || got.Broker.Err != "broker down" || !got.Gateway.Reachable {
		t.Errorf("sources: gateway %+v broker %+v", got.Gateway, got.Broker)
	}

	if !find(t, got, "one@example.com").Pausable() {
		t.Error("credentials dropped while the broker is unreachable")
	}
}

func TestPrunesAtMostHourly(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, false)

	r.monitor.Refresh(ctx)

	r.now = t0.Add(30 * time.Minute)
	r.monitor.Refresh(ctx)

	r.now = t0.Add(61 * time.Minute)
	r.monitor.Refresh(ctx)

	if len(r.recorder.pruned) != 2 || !r.recorder.pruned[0].Equal(t0.Add(-24*time.Hour)) {
		t.Errorf("pruned at %v, want twice with a 24h cutoff", r.recorder.pruned)
	}
}

func TestSetPaused(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, true)
	r.monitor.Refresh(ctx)

	id := find(t, r.monitor.State(), "two@example.com").ID

	paused, err := r.monitor.SetPaused(ctx, id, true)
	if err != nil || !paused.Paused {
		t.Fatalf("pause: %+v, %v", paused, err)
	}

	if !find(t, r.monitor.State(), "two@example.com").Paused || find(t, r.monitor.State(), "one@example.com").Paused {
		t.Error("state does not show exactly the paused account")
	}

	resumed, err := r.monitor.SetPaused(ctx, id, false)
	if err != nil || resumed.Paused {
		t.Fatalf("resume: %+v, %v", resumed, err)
	}

	want := []string{"set anthropic:oauth account-policy", "delete anthropic:oauth account-policy"}
	if len(r.broker.calls) != 2 || r.broker.calls[0] != want[0] || r.broker.calls[1] != want[1] {
		t.Errorf("broker calls = %v, want %v", r.broker.calls, want)
	}
}

func TestResumeLeavesOmpsOwnBlockAlone(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, true)
	// omp's own account-policy block: same scope, a near deadline.
	r.broker.credentials[1].Blocks = []accounts.Block{{Scope: accounts.PauseScope, Until: t0.Add(time.Hour)}}
	r.monitor.Refresh(ctx)

	account := find(t, r.monitor.State(), "two@example.com")
	if account.Paused || !account.BlockedUntil.Equal(t0.Add(time.Hour)) {
		t.Fatalf("account: %+v", account)
	}

	if _, err := r.monitor.SetPaused(ctx, account.ID, false); err != nil {
		t.Fatal(err)
	}

	if len(r.broker.calls) != 0 {
		t.Errorf("broker calls = %v, want none", r.broker.calls)
	}
}

func TestSetPausedErrors(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	without := newRig(t, false)
	without.monitor.Refresh(ctx)

	id := find(t, without.monitor.State(), "one@example.com").ID
	if _, err := without.monitor.SetPaused(ctx, id, true); !errors.Is(err, monitor.ErrNoBroker) {
		t.Errorf("without a broker: %v", err)
	}

	r := newRig(t, true)
	r.gateway.set(append(reports(), accounts.Report{Provider: "anthropic", Email: "stray@example.com"}), nil)
	r.monitor.Refresh(ctx)

	if _, err := r.monitor.SetPaused(ctx, "0000000000000000", true); !errors.Is(err, monitor.ErrUnknownAccount) {
		t.Errorf("unknown account: %v", err)
	}

	stray := find(t, r.monitor.State(), "stray@example.com").ID
	if _, err := r.monitor.SetPaused(ctx, stray, true); !errors.Is(err, monitor.ErrNotPausable) {
		t.Errorf("account without a credential: %v", err)
	}

	r.broker.err = errors.New("broker down")
	if _, err := r.monitor.SetPaused(ctx, id, false); err == nil {
		t.Error("resume with the broker down: no error")
	}
}

func TestSubscribe(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	r := newRig(t, false)

	changed, cancel := r.monitor.Subscribe()

	// Two polls before a read leave one pending signal and never block.
	r.monitor.Refresh(ctx)
	r.monitor.Refresh(ctx)

	select {
	case <-changed:
	default:
		t.Fatal("no signal after a poll")
	}

	select {
	case <-changed:
		t.Fatal("a second signal was queued")
	default:
	}

	cancel()
	r.monitor.Refresh(ctx)

	select {
	case <-changed:
		t.Fatal("signal after cancel")
	default:
	}
}

func TestRunPollsUntilCancelled(t *testing.T) {
	t.Parallel()

	r := newRig(t, false)
	changed, cancel := r.monitor.Subscribe()

	defer cancel()

	ctx, stop := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		r.monitor.Run(ctx)
		close(done)
	}()

	select {
	case <-changed:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not poll on start")
	}

	stop()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

package collector_test

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/internal/collector"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/traffic"
)

var (
	t0     = time.Date(2026, time.November, 13, 9, 30, 0, 0, time.UTC)
	claude = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "anthropic"}
	codex  = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "openai-codex"}
)

// burst is a run of traffic as the broker keeps it: one row, stamped with
// its last request.
type burst struct {
	ended  time.Time
	key    traffic.Key
	counts traffic.Counts
}

// fakeBroker answers like omp's: totals of the bursts that ended at or after
// a moment, or of all of them.
type fakeBroker struct {
	mu     sync.Mutex
	now    time.Time
	bursts []burst
	err    error
	asked  int
}

func (b *fakeBroker) ClientUsage(_ context.Context, since time.Time) (traffic.Summary, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.asked++

	if b.err != nil {
		return traffic.Summary{}, b.err
	}

	out := traffic.Summary{
		GeneratedAt: b.now,
		Hostnames:   map[string]string{"install-1": "gateway-host"},
		Counts:      map[traffic.Key]traffic.Counts{},
	}

	for _, burst := range b.bursts {
		if since.IsZero() || !burst.ended.Before(since) {
			out.Counts[burst.key] = out.Counts[burst.key].Add(burst.counts)
		}
	}

	return out, nil
}

// grow adds to a burst that is still running and stamps it with now.
func (b *fakeBroker) grow(index int, now time.Time, more traffic.Counts) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.now = now
	b.bursts[index].ended = now
	b.bursts[index].counts = b.bursts[index].counts.Add(more)
}

func (b *fakeBroker) set(now time.Time, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.now, b.err = now, err
}

type harness struct {
	broker *fakeBroker
	record *store.Store
	*collector.Collector

	mu  sync.Mutex
	now time.Time
}

func (h *harness) at(now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.now = now
}

func newHarness(t *testing.T, retention time.Duration, bursts ...burst) *harness {
	t.Helper()

	record, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = record.Close() })

	h := &harness{broker: &fakeBroker{now: t0, bursts: bursts}, record: record, now: t0}
	h.Collector = collector.New(slog.New(slog.DiscardHandler), collector.Config{
		Broker: h.broker, Record: record, Interval: time.Hour, Retention: retention,
		Now: func() time.Time {
			h.mu.Lock()
			defer h.mu.Unlock()

			return h.now
		},
	})

	return h
}

func (h *harness) totals(t *testing.T, measuredOnly bool) map[traffic.Key]traffic.Counts {
	t.Helper()

	totals, err := h.record.TrafficTotals(context.Background(), time.Time{}, measuredOnly)
	if err != nil {
		t.Fatal(err)
	}

	out := map[traffic.Key]traffic.Counts{}
	for _, total := range totals {
		out[total.Key] = total.Counts
	}

	return out
}

func TestFirstCollectionEstimatesTheDaysBefore(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	h := newHarness(t, 0,
		burst{ended: t0.Add(-26 * time.Hour), key: claude, counts: traffic.Counts{Requests: 40, CostUSD: 12}},
		burst{ended: t0.Add(-3 * time.Hour), key: codex, counts: traffic.Counts{Requests: 5, CostUSD: 1}},
		// Still running: it has been for hours, and the broker only knows its last request.
		burst{ended: t0.Add(-time.Second), key: claude, counts: traffic.Counts{Requests: 300, CostUSD: 90}},
		// Too old to be in the estimate.
		burst{ended: t0.Add(-9 * 24 * time.Hour), key: claude, counts: traffic.Counts{Requests: 7, CostUSD: 2}},
	)

	h.Collect(ctx)

	if status := h.Status(); status.Err != "" || !status.UpdatedAt.Equal(t0) {
		t.Fatalf("status = %+v", status)
	}

	// Nothing has been measured yet; the estimate holds the last seven days.
	if measured := h.totals(t, true); len(measured) != 0 {
		t.Errorf("measured = %+v, want nothing", measured)
	}

	all := h.totals(t, false)
	if all[claude].Requests != 340 || all[claude].CostUSD != 102 || all[codex].Requests != 5 {
		t.Errorf("estimate = %+v", all)
	}

	// Each burst is filed under the hour it ended in.
	hours, err := h.record.TrafficSeries(ctx, t0.Truncate(time.Hour).Add(-26*time.Hour), time.Hour, 27, false)
	if err != nil {
		t.Fatal(err)
	}

	got := map[int]int64{}
	for _, step := range hours {
		got[step.Index] += step.Requests
	}

	if len(got) != 3 || got[0] != 40 || got[23] != 5 || got[26] != 300 {
		t.Errorf("hours with traffic = %v, want 40 at 0, 5 at 23, 300 at 26", got)
	}

	if since, sinceErr := h.record.TrafficMeasuredSince(ctx); sinceErr != nil || !since.Equal(t0) {
		t.Errorf("measured since = %v, err %v", since, sinceErr)
	}
}

func TestLaterCollectionsMeasureTheGrowth(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	h := newHarness(t, 0, burst{ended: t0.Add(-time.Second), key: claude, counts: traffic.Counts{Requests: 300, CostUSD: 90}})

	h.Collect(ctx)

	asked := h.broker.asked

	// Fifteen seconds on, the running burst has four more requests.
	later := t0.Add(15 * time.Second)
	h.at(later)
	h.broker.grow(0, later, traffic.Counts{Requests: 4, OutputTokens: 800, CostUSD: 1.25})
	h.Collect(ctx)

	// One question per collection once measuring has begun.
	if h.broker.asked != asked+1 {
		t.Errorf("asked the broker %d times, want 1", h.broker.asked-asked)
	}

	want := traffic.Counts{Requests: 4, OutputTokens: 800, CostUSD: 1.25}
	if measured := h.totals(t, true); len(measured) != 1 || measured[claude] != want {
		t.Errorf("measured = %+v, want %+v", measured, want)
	}

	minutes, err := h.record.TrafficSeries(ctx, t0, time.Minute, 1, true)
	if err != nil || len(minutes) != 1 || minutes[0].Requests != 4 {
		t.Errorf("minute series = %+v, err %v", minutes, err)
	}

	// Nothing more passed: the next collection stores nothing new.
	h.at(later.Add(15 * time.Second))
	h.broker.set(later.Add(15*time.Second), nil)
	h.Collect(ctx)

	if measured := h.totals(t, true); measured[claude] != want {
		t.Errorf("measured after an idle collection = %+v", measured)
	}
}

func TestFailedCollectionIsMadeUpLater(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	h := newHarness(t, 0, burst{ended: t0.Add(-time.Second), key: claude, counts: traffic.Counts{Requests: 300, CostUSD: 90}})

	changed, cancel := h.Subscribe()
	defer cancel()

	h.Collect(ctx)

	select {
	case <-changed:
	default:
		t.Fatal("a collection did not tell its subscriber")
	}

	// The broker goes away for a collection.
	h.at(t0.Add(15 * time.Second))
	h.broker.set(t0.Add(15*time.Second), errors.New("GET /v1/usage/clients: connection refused"))
	h.Collect(ctx)

	status := h.Status()
	if status.Err != "GET /v1/usage/clients: connection refused" || !status.UpdatedAt.Equal(t0) {
		t.Errorf("status while failing = %+v", status)
	}

	select {
	case <-changed:
	default:
		t.Error("a failed collection did not tell its subscriber")
	}

	// It comes back; what passed meanwhile is measured over the whole stretch.
	back := t0.Add(30 * time.Second)
	h.at(back)
	h.broker.set(back, nil)
	h.broker.grow(0, back, traffic.Counts{Requests: 6, CostUSD: 2})
	h.Collect(ctx)

	if status = h.Status(); status.Err != "" || !status.UpdatedAt.Equal(back) {
		t.Errorf("status after recovery = %+v", status)
	}

	if measured := h.totals(t, true); measured[claude].Requests != 6 {
		t.Errorf("measured = %+v, want the 6 requests", measured)
	}
}

func TestShrunkTotalsStartOver(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	h := newHarness(t, 0, burst{ended: t0.Add(-time.Second), key: claude, counts: traffic.Counts{Requests: 300, CostUSD: 90}})

	h.Collect(ctx)

	// The broker lost its rows and has counted 2 requests since.
	h.broker.mu.Lock()
	h.broker.bursts = []burst{{ended: t0.Add(10 * time.Second), key: claude, counts: traffic.Counts{Requests: 2, CostUSD: 1}}}
	h.broker.mu.Unlock()

	h.at(t0.Add(15 * time.Second))
	h.broker.set(t0.Add(15*time.Second), nil)
	h.Collect(ctx)

	if measured := h.totals(t, true); len(measured) != 0 {
		t.Errorf("measured = %+v, want nothing: what passed cannot be told from what was lost", measured)
	}

	// From the new totals on, growth is measured again.
	h.at(t0.Add(30 * time.Second))
	h.broker.grow(0, t0.Add(30*time.Second), traffic.Counts{Requests: 3, CostUSD: 1})
	h.Collect(ctx)

	if measured := h.totals(t, true); measured[claude].Requests != 3 {
		t.Errorf("measured = %+v, want 3 requests", measured)
	}
}

func TestOldTrafficIsPruned(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	h := newHarness(t, 24*time.Hour,
		burst{ended: t0.Add(-50 * time.Hour), key: claude, counts: traffic.Counts{Requests: 40, CostUSD: 12}},
		burst{ended: t0.Add(-2 * time.Hour), key: claude, counts: traffic.Counts{Requests: 5, CostUSD: 1}},
	)

	h.Collect(ctx)

	if all := h.totals(t, false); all[claude].Requests != 5 {
		t.Errorf("after pruning = %+v, want only the last day", all)
	}
}

func TestRunStopsWithItsContext(t *testing.T) {
	t.Parallel()

	h := newHarness(t, 0)

	collected, unsubscribe := h.Subscribe()
	defer unsubscribe()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		defer close(done)

		h.Run(ctx)
	}()

	// Run collects at once, before its first tick.
	select {
	case <-collected:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not collect")
	}

	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop")
	}

	if h.Status().UpdatedAt.IsZero() {
		t.Error("Run did not collect before it stopped")
	}
}

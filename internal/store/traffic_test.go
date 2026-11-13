package store_test

import (
	"context"
	"database/sql"
	"math"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/traffic"
)

var (
	claude = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "anthropic"}
	codex  = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "openai-codex"}
	laptop = traffic.Key{InstallID: "install-2", App: "omp", Provider: "anthropic"}
)

func bucket(key traffic.Key, start time.Time, requests int64, cost float64, estimated bool) traffic.Bucket {
	return traffic.Bucket{
		Start: start, Key: key, Hostname: "host-" + key.InstallID, Estimated: estimated,
		Requests: requests, InputTokens: requests, OutputTokens: requests * 10,
		CacheReadTokens: requests * 100, CacheWriteTokens: requests * 1000, CostUSD: cost,
	}
}

func TestTrafficReading(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	at, totals, err := s.TrafficReading(ctx)
	if err != nil || !at.IsZero() || totals != nil {
		t.Fatalf("before the first reading: %v, %v, err %v", at, totals, err)
	}

	if since, sinceErr := s.TrafficMeasuredSince(ctx); sinceErr != nil || !since.IsZero() {
		t.Fatalf("measured since = %v, err %v; want zero before the first reading", since, sinceErr)
	}

	first := map[traffic.Key]traffic.Counts{claude: {Requests: 10, CostUSD: 3}, codex: {Requests: 2, CostUSD: 0.5}}
	if err = s.AddTraffic(ctx, nil, t0, first); err != nil {
		t.Fatal(err)
	}

	// The second reading replaces the first: Codex is gone from the broker.
	second := map[traffic.Key]traffic.Counts{claude: {Requests: 14, OutputTokens: 900, CostUSD: 4.5}}
	if err = s.AddTraffic(ctx, nil, t0.Add(15*time.Second), second); err != nil {
		t.Fatal(err)
	}

	at, totals, err = s.TrafficReading(ctx)
	if err != nil || !at.Equal(t0.Add(15*time.Second)) || !reflect.DeepEqual(totals, second) {
		t.Errorf("reading = %v, %+v, err %v; want the second", at, totals, err)
	}

	// Measuring began with the first reading and that does not move.
	if since, sinceErr := s.TrafficMeasuredSince(ctx); sinceErr != nil || !since.Equal(t0) {
		t.Errorf("measured since = %v, err %v; want %v", since, sinceErr, t0)
	}
}

func TestAddTrafficAddsUp(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	// Two readings in one minute, one in the next; an estimate for the same hour.
	for i, buckets := range [][]traffic.Bucket{
		{bucket(claude, t0.Add(5*time.Second), 3, 1.5, false), bucket(codex, t0.Add(5*time.Second), 1, 0.25, false)},
		{bucket(claude, t0.Add(20*time.Second), 2, 0.5, false)},
		{bucket(claude, t0.Add(time.Minute), 4, 2, false), bucket(laptop, t0.Add(time.Minute), 1, 0.1, false)},
		{bucket(claude, t0, 100, 40, true)},
	} {
		if err := s.AddTraffic(ctx, buckets, t0.Add(time.Duration(i)*time.Second), nil); err != nil {
			t.Fatal(err)
		}
	}

	steps, err := s.TrafficSeries(ctx, t0.Add(-time.Minute), time.Minute, 3, true)
	if err != nil {
		t.Fatal(err)
	}

	want := []store.TrafficStep{
		{Index: 1, Provider: "anthropic", Counts: bucket(claude, t0, 5, 2, false).Counts},
		// Both clients' traffic to Anthropic in the second minute.
		{Index: 2, Provider: "anthropic", Counts: bucket(claude, t0, 5, 2.1, false).Counts},
		{Index: 1, Provider: "openai-codex", Counts: bucket(codex, t0, 1, 0.25, false).Counts},
	}
	if !reflect.DeepEqual(steps, want) {
		t.Errorf("measured series =\n%+v\nwant\n%+v", steps, want)
	}

	// By the hour, estimates count too.
	hours, err := s.TrafficSeries(ctx, t0, time.Hour, 1, false)
	if err != nil {
		t.Fatal(err)
	}

	if len(hours) != 2 || hours[0].Provider != "anthropic" || hours[0].Requests != 110 ||
		math.Abs(hours[0].CostUSD-44.1) > 1e-9 {
		t.Errorf("series with estimates = %+v", hours)
	}

	// Outside the series' span nothing is returned.
	if early, earlyErr := s.TrafficSeries(ctx, t0.Add(-time.Hour), time.Minute, 60, false); earlyErr != nil || len(early) != 0 {
		t.Errorf("series before any traffic = %+v, err %v", early, earlyErr)
	}
}

func TestTrafficTotals(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	buckets := []traffic.Bucket{
		bucket(claude, t0.Add(-2*time.Hour), 50, 20, true),
		bucket(claude, t0, 5, 2, false),
		bucket(laptop, t0, 9, 3, false),
		bucket(codex, t0, 1, 0.25, false),
	}
	if err := s.AddTraffic(ctx, buckets, t0, nil); err != nil {
		t.Fatal(err)
	}

	totals, err := s.TrafficTotals(ctx, t0.Add(-3*time.Hour), false)
	if err != nil {
		t.Fatal(err)
	}

	// The costliest stream first; the gateway's includes its estimate.
	if len(totals) != 3 || totals[0].Key != claude || totals[0].Requests != 55 || totals[0].Hostname != "host-install-1" ||
		totals[1].Key != laptop || totals[2].Key != codex {
		t.Errorf("totals = %+v", totals)
	}

	measured, err := s.TrafficTotals(ctx, t0.Add(-3*time.Hour), true)
	if err != nil {
		t.Fatal(err)
	}

	if len(measured) != 3 || measured[0].Key != laptop || measured[1].Key != claude || measured[1].Requests != 5 {
		t.Errorf("measured totals = %+v", measured)
	}

	recent, err := s.TrafficTotals(ctx, t0.Add(time.Minute), false)
	if err != nil || len(recent) != 0 {
		t.Errorf("totals after the last bucket = %+v, err %v", recent, err)
	}
}

func TestPruneTraffic(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	buckets := []traffic.Bucket{bucket(claude, t0.Add(-48*time.Hour), 1, 1, false), bucket(claude, t0, 2, 2, false)}
	if err := s.AddTraffic(ctx, buckets, t0, nil); err != nil {
		t.Fatal(err)
	}

	n, err := s.PruneTraffic(ctx, t0.Add(-24*time.Hour))
	if err != nil || n != 1 {
		t.Fatalf("PruneTraffic() = %d, %v; want 1", n, err)
	}

	totals, err := s.TrafficTotals(ctx, time.Time{}, false)
	if err != nil || len(totals) != 1 || totals[0].Requests != 2 {
		t.Errorf("after pruning: %+v, err %v", totals, err)
	}
}

// A database written before traffic was recorded gains its tables and keeps
// its usage history.
func TestOpenUpgradesVersionOne(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "usage.db")

	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}

	if _, err = db.ExecContext(ctx, `
		CREATE TABLE usage_samples (
			account_id TEXT NOT NULL, limit_id TEXT NOT NULL, recorded_at INTEGER NOT NULL, provider TEXT NOT NULL,
			label TEXT NOT NULL, used_fraction REAL NOT NULL, status TEXT NOT NULL, resets_at INTEGER,
			PRIMARY KEY (account_id, limit_id, recorded_at)
		) WITHOUT ROWID;
		INSERT INTO usage_samples VALUES ('a', '7d', 1, 'anthropic', 'Claude 7 Day', 0.3, 'ok', NULL);
		PRAGMA user_version = 1;`); err != nil {
		t.Fatal(err)
	}

	if err = db.Close(); err != nil {
		t.Fatal(err)
	}

	s := open(t, path)

	if history, historyErr := s.History(ctx, "a", time.Time{}); historyErr != nil || len(history) != 1 {
		t.Errorf("history after the upgrade: %+v, err %v", history, historyErr)
	}

	if err = s.AddTraffic(ctx, []traffic.Bucket{bucket(claude, t0, 1, 1, false)}, t0, nil); err != nil {
		t.Errorf("traffic after the upgrade: %v", err)
	}
}

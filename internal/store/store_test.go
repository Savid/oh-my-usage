package store_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/internal/store"
)

var t0 = time.Date(2026, time.November, 13, 9, 0, 0, 0, time.UTC)

func open(t *testing.T, path string) *store.Store {
	t.Helper()

	s, err := store.Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = s.Close() })

	return s
}

func sample(account, limit string, at time.Time, used float64) store.Sample {
	return store.Sample{
		AccountID: account, LimitID: limit, At: at, Provider: "anthropic",
		Label: "Claude 7 Day", UsedFraction: used, Status: "ok",
	}
}

func TestRecordAndHistory(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	withReset := sample("a", "7d", t0.Add(time.Hour), 0.5)
	withReset.ResetsAt = t0.Add(48 * time.Hour)

	if err := s.Record(ctx, []store.Sample{
		withReset,
		sample("a", "7d", t0, 0.4),
		sample("a", "5h", t0, 0.1),
		sample("b", "7d", t0, 0.9),
	}); err != nil {
		t.Fatal(err)
	}

	// The same report again changes nothing, even with a different value.
	if err := s.Record(ctx, []store.Sample{sample("a", "7d", t0, 0.99)}); err != nil {
		t.Fatal(err)
	}

	got, err := s.History(ctx, "a", t0)
	if err != nil {
		t.Fatal(err)
	}

	if len(got) != 3 {
		t.Fatalf("got %d samples, want 3: %+v", len(got), got)
	}

	if got[0].LimitID != "5h" || got[1].LimitID != "7d" || got[1].UsedFraction != 0.4 || !got[2].At.Equal(t0.Add(time.Hour)) {
		t.Errorf("order or values: %+v", got)
	}

	if !got[0].ResetsAt.IsZero() || !got[2].ResetsAt.Equal(withReset.ResetsAt) || got[2].At.Location() != time.UTC {
		t.Errorf("reset times: %+v", got)
	}

	if got[2].Provider != "anthropic" || got[2].Label != "Claude 7 Day" || got[2].Status != "ok" || got[2].AccountID != "a" {
		t.Errorf("fields: %+v", got[2])
	}

	later, err := s.History(ctx, "a", t0.Add(time.Minute))
	if err != nil || len(later) != 1 {
		t.Errorf("since filter: %d samples, err %v", len(later), err)
	}

	none, err := s.History(ctx, "nobody", t0)
	if err != nil || none == nil || len(none) != 0 {
		t.Errorf("unknown account: %v, err %v; want an empty, non-nil list", none, err)
	}
}

func TestPrune(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	s := open(t, filepath.Join(t.TempDir(), "usage.db"))

	if err := s.Record(ctx, []store.Sample{
		sample("a", "7d", t0.Add(-48*time.Hour), 0.1),
		sample("a", "7d", t0, 0.2),
	}); err != nil {
		t.Fatal(err)
	}

	n, err := s.Prune(ctx, t0.Add(-time.Hour))
	if err != nil || n != 1 {
		t.Fatalf("Prune() = %d, %v; want 1", n, err)
	}

	got, err := s.History(ctx, "a", time.Time{})
	if err != nil || len(got) != 1 || got[0].UsedFraction != 0.2 {
		t.Errorf("after prune: %+v, err %v", got, err)
	}
}

func TestReopenKeepsData(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "usage.db")

	first, err := store.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}

	if err = first.Record(ctx, []store.Sample{sample("a", "7d", t0, 0.3)}); err != nil {
		t.Fatal(err)
	}

	if err = first.Close(); err != nil {
		t.Fatal(err)
	}

	got, err := open(t, path).History(ctx, "a", t0)
	if err != nil || len(got) != 1 {
		t.Errorf("after reopen: %+v, err %v", got, err)
	}
}

func TestOpenRefusesNewerSchema(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "usage.db")

	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}

	if _, err = db.ExecContext(context.Background(), "PRAGMA user_version = 99"); err != nil {
		t.Fatal(err)
	}

	if err = db.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err = store.Open(context.Background(), path); err == nil {
		t.Fatal("opened a database with a newer schema")
	}

	if _, err = store.Open(context.Background(), ""); err == nil {
		t.Fatal("opened an empty path")
	}
}

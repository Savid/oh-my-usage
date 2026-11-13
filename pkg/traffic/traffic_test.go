package traffic_test

import (
	"cmp"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/pkg/traffic"
)

var (
	now    = clock(10, 30, 20)
	claude = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "anthropic"}
	codex  = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "openai-codex"}
	hosts  = map[string]string{"install-1": "gateway-host"}
)

func clock(hour, minute, second int) time.Time {
	return time.Date(2026, time.November, 13, hour, minute, second, 0, time.UTC)
}

func sorted(buckets []traffic.Bucket) []traffic.Bucket {
	slices.SortFunc(buckets, func(a, b traffic.Bucket) int {
		return cmp.Or(a.Start.Compare(b.Start), cmp.Compare(a.Provider, b.Provider))
	})

	return buckets
}

func TestDelta(t *testing.T) {
	t.Parallel()

	fresh := traffic.Key{InstallID: "install-2", App: "omp", Provider: "anthropic"}

	previous := map[traffic.Key]traffic.Counts{
		claude: {Requests: 10, OutputTokens: 1000, CostUSD: 3},
		codex:  {Requests: 5, InputTokens: 50, CostUSD: 0.5},
	}
	current := map[traffic.Key]traffic.Counts{
		claude: {Requests: 14, OutputTokens: 1600, CostUSD: 4.5},
		// Fewer requests than before: the broker dropped rows.
		codex: {Requests: 2, InputTokens: 70, CostUSD: 0.6},
		// A stream not seen before is all new.
		fresh: {Requests: 1, InputTokens: 9, CostUSD: 0.01},
	}

	want := map[traffic.Key]traffic.Counts{
		claude: {Requests: 4, OutputTokens: 600, CostUSD: 1.5},
		fresh:  {Requests: 1, InputTokens: 9, CostUSD: 0.01},
	}

	if got := traffic.Delta(previous, current); !reflect.DeepEqual(got, want) {
		t.Errorf("Delta() = %+v, want %+v", got, want)
	}

	if got := traffic.Delta(current, current); len(got) != 0 {
		t.Errorf("Delta() of the same reading = %+v, want nothing", got)
	}
}

func TestSpread(t *testing.T) {
	t.Parallel()

	passed := map[traffic.Key]traffic.Counts{claude: {Requests: 5, OutputTokens: 300, CostUSD: 3}}
	bucket := func(start time.Time, counts traffic.Counts, estimated bool) traffic.Bucket {
		return traffic.Bucket{Start: start, Key: claude, Hostname: "gateway-host", Counts: counts, Estimated: estimated}
	}

	tests := []struct {
		name     string
		from, to time.Time
		want     []traffic.Bucket
	}{
		{
			"readings seconds apart land in their minute",
			clock(10, 30, 5), clock(10, 30, 20),
			[]traffic.Bucket{bucket(clock(10, 30, 0), traffic.Counts{Requests: 5, OutputTokens: 300, CostUSD: 3}, false)},
		},
		{
			"a stretch across a minute mark is shared between the two",
			clock(10, 29, 50), clock(10, 30, 5),
			[]traffic.Bucket{
				bucket(clock(10, 29, 0), traffic.Counts{Requests: 3, OutputTokens: 150, CostUSD: 1.5}, false),
				bucket(clock(10, 30, 0), traffic.Counts{Requests: 2, OutputTokens: 150, CostUSD: 1.5}, false),
			},
		},
		{
			"a stretch that ends on a minute mark does not touch the next minute",
			clock(10, 28, 0), clock(10, 30, 0),
			[]traffic.Bucket{
				bucket(clock(10, 28, 0), traffic.Counts{Requests: 3, OutputTokens: 150, CostUSD: 1.5}, false),
				bucket(clock(10, 29, 0), traffic.Counts{Requests: 2, OutputTokens: 150, CostUSD: 1.5}, false),
			},
		},
		{
			"a long stretch is spread over its hours as an estimate",
			clock(7, 45, 0), clock(10, 30, 20),
			[]traffic.Bucket{
				bucket(clock(7, 0, 0), traffic.Counts{Requests: 2, OutputTokens: 75, CostUSD: 0.75}, true),
				bucket(clock(8, 0, 0), traffic.Counts{Requests: 1, OutputTokens: 75, CostUSD: 0.75}, true),
				bucket(clock(9, 0, 0), traffic.Counts{Requests: 1, OutputTokens: 75, CostUSD: 0.75}, true),
				bucket(clock(10, 0, 0), traffic.Counts{Requests: 1, OutputTokens: 75, CostUSD: 0.75}, true),
			},
		},
		{
			"readings at the same instant still have a minute",
			clock(10, 30, 20), clock(10, 30, 20),
			[]traffic.Bucket{bucket(clock(10, 30, 0), traffic.Counts{Requests: 5, OutputTokens: 300, CostUSD: 3}, false)},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			if got := sorted(traffic.Spread(test.from, test.to, passed, hosts)); !reflect.DeepEqual(got, test.want) {
				t.Errorf("Spread() =\n%+v\nwant\n%+v", got, test.want)
			}
		})
	}
}

func TestSpreadLeavesOutEmptyShares(t *testing.T) {
	t.Parallel()

	// One request over three minutes: only the first minute has anything.
	passed := map[traffic.Key]traffic.Counts{claude: {Requests: 1}}

	got := traffic.Spread(clock(10, 28, 10), clock(10, 30, 20), passed, hosts)
	if len(got) != 1 || !got[0].Start.Equal(clock(10, 28, 0)) || got[0].Requests != 1 {
		t.Errorf("Spread() = %+v, want the one request in the first minute", got)
	}
}

func TestBackfillMarks(t *testing.T) {
	t.Parallel()

	got := traffic.BackfillMarks(now)

	// Seven days of hours, and the hour now running.
	if len(got) != 7*24+1 {
		t.Fatalf("BackfillMarks() has %d marks, want %d", len(got), 7*24+1)
	}

	if want := time.Date(2026, time.November, 6, 10, 0, 0, 0, time.UTC); !got[0].Equal(want) {
		t.Errorf("first mark = %v, want %v", got[0], want)
	}

	if last := got[len(got)-1]; !last.Equal(clock(10, 0, 0)) {
		t.Errorf("last mark = %v, want the hour now running", last)
	}
}

func TestBackfill(t *testing.T) {
	t.Parallel()

	marks := []time.Time{clock(8, 0, 0), clock(9, 0, 0), clock(10, 0, 0)}
	summaries := []traffic.Summary{
		{Hostnames: hosts, Counts: map[traffic.Key]traffic.Counts{
			claude: {Requests: 10, OutputTokens: 1000, CostUSD: 3},
			codex:  {Requests: 2, InputTokens: 50, CostUSD: 0.5},
		}},
		{Hostnames: hosts, Counts: map[traffic.Key]traffic.Counts{
			claude: {Requests: 4, OutputTokens: 400, CostUSD: 1},
			codex:  {Requests: 2, InputTokens: 50, CostUSD: 0.5},
		}},
		{Hostnames: hosts, Counts: map[traffic.Key]traffic.Counts{
			// One more request than the answer before knew of: it arrived between the two.
			claude: {Requests: 5, OutputTokens: 400, CostUSD: 1},
		}},
	}

	want := []traffic.Bucket{
		{Start: clock(8, 0, 0), Key: claude, Hostname: "gateway-host", Estimated: true, Requests: 6, OutputTokens: 600, CostUSD: 2},
		// Codex ended nothing in the first hour or the last, so it has one bucket.
		{Start: clock(9, 0, 0), Key: codex, Hostname: "gateway-host", Estimated: true, Requests: 2, InputTokens: 50, CostUSD: 0.5},
		// Never below zero; the last answer is the hour now running.
		{Start: clock(10, 0, 0), Key: claude, Hostname: "gateway-host", Estimated: true, Requests: 5, OutputTokens: 400, CostUSD: 1},
	}

	if got := sorted(traffic.Backfill(marks, summaries)); !reflect.DeepEqual(got, want) {
		t.Errorf("Backfill() =\n%+v\nwant\n%+v", got, want)
	}
}

func TestCounts(t *testing.T) {
	t.Parallel()

	counts := traffic.Counts{Requests: 1, InputTokens: 2, OutputTokens: 3, CacheReadTokens: 4, CacheWriteTokens: 5, CostUSD: 0.5}

	if got := counts.Tokens(); got != 14 {
		t.Errorf("Tokens() = %d, want 14", got)
	}

	if counts.IsZero() || !(traffic.Counts{}).IsZero() {
		t.Error("IsZero() should hold for the zero value only")
	}

	want := traffic.Counts{Requests: 2, InputTokens: 4, OutputTokens: 6, CacheReadTokens: 8, CacheWriteTokens: 10, CostUSD: 1}
	if got := counts.Add(counts); got != want {
		t.Errorf("Add() = %+v, want %+v", got, want)
	}
}

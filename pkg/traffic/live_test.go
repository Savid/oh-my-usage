package traffic_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/pkg/traffic"
)

func TestLiveIsEmptyAtFirst(t *testing.T) {
	t.Parallel()

	var live traffic.Live

	if start, steps, counts := live.Series(); !start.IsZero() || steps != 0 || counts != nil {
		t.Errorf("Series() = %v, %d, %v, want nothing", start, steps, counts)
	}
}

func TestLiveFilesAStretchInProportion(t *testing.T) {
	t.Parallel()

	var live traffic.Live

	// 10:30:03 to 10:30:13 overlaps three steps: 2s, 5s and 3s of its 10s.
	// Each count is cut at the same running marks, so the parts add up.
	live.Add(clock(10, 30, 3), clock(10, 30, 13), map[traffic.Key]traffic.Counts{
		claude: {Requests: 10, OutputTokens: 1000, CostUSD: 1},
		codex:  {OutputTokens: 7},
	})

	start, steps, counts := live.Series()
	if want := clock(10, 30, 0); !start.Equal(want) || steps != 3 {
		t.Fatalf("Series() starts %v with %d steps, want %v with 3", start, steps, want)
	}

	want := []traffic.LiveCounts{
		{Index: 0, Provider: "anthropic", Requests: 2, OutputTokens: 200, CostUSD: 0.2},
		{Index: 0, Provider: "openai-codex", OutputTokens: 1},
		{Index: 1, Provider: "anthropic", Requests: 5, OutputTokens: 500, CostUSD: 0.5},
		{Index: 1, Provider: "openai-codex", OutputTokens: 3},
		{Index: 2, Provider: "anthropic", Requests: 3, OutputTokens: 300, CostUSD: 0.3},
		{Index: 2, Provider: "openai-codex", OutputTokens: 3},
	}

	if !reflect.DeepEqual(roundCosts(counts), want) {
		t.Errorf("Series() counts = %+v, want %+v", counts, want)
	}
}

func TestLiveAddsUpReadingsByProvider(t *testing.T) {
	t.Parallel()

	var live traffic.Live

	other := traffic.Key{InstallID: "install-2", App: "omp", Provider: "anthropic"}

	live.Add(clock(10, 30, 0), clock(10, 30, 5), map[traffic.Key]traffic.Counts{claude: {OutputTokens: 5}})
	live.Add(clock(10, 30, 5), clock(10, 30, 10), map[traffic.Key]traffic.Counts{
		claude: {OutputTokens: 1},
		other:  {OutputTokens: 2},
	})
	// Nothing passed: the record still reaches the reading.
	live.Add(clock(10, 30, 10), clock(10, 30, 15), nil)

	_, steps, counts := live.Series()
	if steps != 4 {
		t.Errorf("Series() has %d steps, want 4: three read and the one still filling", steps)
	}

	want := []traffic.LiveCounts{
		{Index: 0, Provider: "anthropic", OutputTokens: 5},
		{Index: 1, Provider: "anthropic", OutputTokens: 3},
	}
	if !reflect.DeepEqual(counts, want) {
		t.Errorf("Series() counts = %+v, want %+v", counts, want)
	}
}

func TestLiveStartsOverAfterAGap(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		from, to  time.Time
		wantStart time.Time
		wantSteps int
	}{
		"a stretch longer than LiveGap": {
			from: clock(10, 31, 0), to: clock(10, 33, 0), wantStart: clock(10, 33, 0), wantSteps: 1,
		},
		"a stretch that skips readings": {
			from: clock(10, 40, 0), to: clock(10, 40, 5), wantStart: clock(10, 40, 0), wantSteps: 2,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			var live traffic.Live

			live.Add(clock(10, 30, 0), clock(10, 31, 0), map[traffic.Key]traffic.Counts{claude: {OutputTokens: 60}})
			live.Add(tt.from, tt.to, map[traffic.Key]traffic.Counts{claude: {OutputTokens: 9}})

			start, steps, counts := live.Series()
			if !start.Equal(tt.wantStart) || steps != tt.wantSteps {
				t.Errorf("Series() starts %v with %d steps, want %v with %d", start, steps, tt.wantStart, tt.wantSteps)
			}

			for _, c := range counts {
				if c.OutputTokens == 1 {
					t.Errorf("Series() kept the stretch before the gap: %+v", counts)
				}
			}
		})
	}
}

func TestLiveKeepsOnlyItsSpan(t *testing.T) {
	t.Parallel()

	var live traffic.Live

	from := clock(10, 0, 0)
	for range 150 {
		to := from.Add(traffic.LiveStep)
		live.Add(from, to, map[traffic.Key]traffic.Counts{claude: {OutputTokens: 1}})
		from = to
	}

	start, steps, counts := live.Series()
	if want := int(traffic.LiveSpan / traffic.LiveStep); steps != want {
		t.Errorf("Series() has %d steps, want %d", steps, want)
	}

	if want := from.Add(-traffic.LiveSpan + traffic.LiveStep); !start.Equal(want) {
		t.Errorf("Series() starts %v, want %v", start, want)
	}

	if len(counts) != steps-1 {
		t.Errorf("Series() has %d steps with traffic, want %d: all but the one still filling", len(counts), steps-1)
	}
}

func TestLiveTakesAReadingOfNoLength(t *testing.T) {
	t.Parallel()

	var live traffic.Live

	live.Add(clock(10, 30, 0), clock(10, 30, 7), map[traffic.Key]traffic.Counts{claude: {OutputTokens: 7}})
	live.Add(clock(10, 30, 7), clock(10, 30, 7), map[traffic.Key]traffic.Counts{claude: {OutputTokens: 3}})

	_, _, counts := live.Series()

	var total int64
	for _, c := range counts {
		total += c.OutputTokens
	}

	if total != 10 {
		t.Errorf("Series() holds %d tokens, want 10", total)
	}
}

// roundCosts rounds each cost to a millionth, so float shares compare.
func roundCosts(counts []traffic.LiveCounts) []traffic.LiveCounts {
	out := make([]traffic.LiveCounts, len(counts))
	for i, c := range counts {
		c.CostUSD = float64(int64(c.CostUSD*1e6+0.5)) / 1e6
		out[i] = c
	}

	return out
}

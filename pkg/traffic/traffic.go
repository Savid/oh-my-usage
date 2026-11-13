// Package traffic is the domain of what passes through an omp gateway:
// requests, tokens and their cost at API prices, as the broker counts them.
//
// The broker keeps running totals. It holds each burst of traffic as one row
// stamped with its last request, so asking it for "everything since a moment"
// returns whole bursts, not the part after that moment. Two things follow.
// Going forward, traffic is measured as the growth of the totals between two
// readings, which is exact. Looking back, before the first reading, the only
// history is those bursts, each filed under the hour it ended in: an estimate.
//
// This package does no I/O.
package traffic

import (
	"time"
)

const (
	// BackfillSpan is how far back the estimate before a first reading reaches.
	BackfillSpan = 7 * 24 * time.Hour
	// Fine is the longest stretch between two readings that is still cut
	// into minutes; a longer one is cut into hours and marked an estimate.
	Fine = time.Hour
	// costSlack absorbs the rounding of a sum of floating-point costs.
	costSlack = 1e-6
)

// Counts is what passed in some stretch of time.
type Counts struct {
	Requests         int64
	InputTokens      int64
	OutputTokens     int64
	CacheReadTokens  int64
	CacheWriteTokens int64
	// CostUSD is what the tokens would cost at the provider's API prices. On
	// a subscription nothing is billed per token; it is a measure of work.
	CostUSD float64
}

// Tokens is every token counted, of all four kinds.
func (c Counts) Tokens() int64 {
	return c.InputTokens + c.OutputTokens + c.CacheReadTokens + c.CacheWriteTokens
}

// IsZero reports whether nothing passed.
func (c Counts) IsZero() bool {
	return c == Counts{}
}

// Add returns c with other added.
func (c Counts) Add(other Counts) Counts {
	return Counts{
		Requests:         c.Requests + other.Requests,
		InputTokens:      c.InputTokens + other.InputTokens,
		OutputTokens:     c.OutputTokens + other.OutputTokens,
		CacheReadTokens:  c.CacheReadTokens + other.CacheReadTokens,
		CacheWriteTokens: c.CacheWriteTokens + other.CacheWriteTokens,
		CostUSD:          c.CostUSD + other.CostUSD,
	}
}

// below reports whether any count is less than other's: the totals shrank,
// which a running total does only when the broker dropped rows or started over.
func (c Counts) below(other Counts) bool {
	return c.Requests < other.Requests ||
		c.InputTokens < other.InputTokens ||
		c.OutputTokens < other.OutputTokens ||
		c.CacheReadTokens < other.CacheReadTokens ||
		c.CacheWriteTokens < other.CacheWriteTokens ||
		c.CostUSD < other.CostUSD-costSlack
}

// minus returns c with other taken away, never below zero.
func (c Counts) minus(other Counts) Counts {
	return Counts{
		Requests:         max(0, c.Requests-other.Requests),
		InputTokens:      max(0, c.InputTokens-other.InputTokens),
		OutputTokens:     max(0, c.OutputTokens-other.OutputTokens),
		CacheReadTokens:  max(0, c.CacheReadTokens-other.CacheReadTokens),
		CacheWriteTokens: max(0, c.CacheWriteTokens-other.CacheWriteTokens),
		CostUSD:          max(0, c.CostUSD-other.CostUSD),
	}
}

// share returns part i of c cut into n equal parts; what does not divide
// goes to the first parts, so the parts add up to c.
func (c Counts) share(i, n int) Counts {
	part := func(total int64) int64 {
		each, rest := total/int64(n), total%int64(n)
		if int64(i) < rest {
			return each + 1
		}

		return each
	}

	return Counts{
		Requests:         part(c.Requests),
		InputTokens:      part(c.InputTokens),
		OutputTokens:     part(c.OutputTokens),
		CacheReadTokens:  part(c.CacheReadTokens),
		CacheWriteTokens: part(c.CacheWriteTokens),
		CostUSD:          c.CostUSD / float64(n),
	}
}

// Key names one stream of traffic: a client installation, the application
// that sent it and the provider it went to.
type Key struct {
	InstallID string
	App       string
	Provider  string
}

// Summary is the broker's answer: totals by stream.
type Summary struct {
	// GeneratedAt is the broker's clock when it answered.
	GeneratedAt time.Time
	// Hostnames maps an installation to the host it runs on.
	Hostnames map[string]string
	Counts    map[Key]Counts
}

// Bucket is one stream's traffic in a minute or an hour.
type Bucket struct {
	// Start is when the minute or the hour begins.
	Start time.Time
	Key
	Hostname string
	Counts
	// Estimated marks traffic whose total is right but whose place in time
	// is not known to the minute.
	Estimated bool
}

// Delta returns how much each stream's running total grew from one reading
// to the next. A stream whose total shrank is left out: the broker dropped
// rows or started over, and what passed meanwhile cannot be told apart.
func Delta(previous, current map[Key]Counts) map[Key]Counts {
	out := map[Key]Counts{}

	for key, total := range current {
		before := previous[key]
		if total.below(before) {
			continue
		}

		if grown := total.minus(before); !grown.IsZero() {
			out[key] = grown
		}
	}

	return out
}

// Spread files what passed between two readings under the minutes that
// stretch touches, in equal shares: the best guess when all that is known is
// the total. Readings seconds apart land in one minute or two. A stretch
// longer than Fine, such as the time the daemon was stopped, is spread over
// its hours and marked an estimate.
func Spread(from, to time.Time, passed map[Key]Counts, hostnames map[string]string) []Bucket {
	step, estimated := time.Minute, false
	if to.Sub(from) > Fine {
		step, estimated = time.Hour, true
	}

	first := from.UTC().Truncate(step)
	parts := 1

	if to.After(from) {
		// The last step is the one holding the instant before `to`.
		parts = int(to.Add(-time.Nanosecond).UTC().Truncate(step).Sub(first)/step) + 1
	}

	var buckets []Bucket

	for key, counts := range passed {
		for i := range parts {
			share := counts.share(i, parts)
			if share.IsZero() {
				continue
			}

			buckets = append(buckets, Bucket{
				Start:     first.Add(time.Duration(i) * step),
				Key:       key,
				Hostname:  hostnames[key.InstallID],
				Counts:    share,
				Estimated: estimated,
			})
		}
	}

	return buckets
}

// BackfillMarks returns the hours to ask the broker about for the estimate
// before a first reading: every hour mark from BackfillSpan ago to the current
// hour, oldest first.
func BackfillMarks(now time.Time) []time.Time {
	last := now.UTC().Truncate(time.Hour)
	out := []time.Time{}

	for at := now.Add(-BackfillSpan).UTC().Truncate(time.Hour); !at.After(last); at = at.Add(time.Hour) {
		out = append(out, at)
	}

	return out
}

// Backfill turns the broker's answers into the estimate: summaries[i] holds
// the bursts that ended at or after marks[i], so one answer less the next is
// the bursts that ended in that hour, and the last answer is the current
// hour's, including any burst still running.
func Backfill(marks []time.Time, summaries []Summary) []Bucket {
	var buckets []Bucket

	for i, summary := range summaries {
		if i >= len(marks) {
			break
		}

		var next map[Key]Counts
		if i+1 < len(summaries) {
			next = summaries[i+1].Counts
		}

		for key, counts := range summary.Counts {
			ended := counts.minus(next[key])
			if ended.IsZero() {
				continue
			}

			buckets = append(buckets, Bucket{
				Start:     marks[i].UTC().Truncate(time.Hour),
				Key:       key,
				Hostname:  summary.Hostnames[key.InstallID],
				Counts:    ended,
				Estimated: true,
			})
		}
	}

	return buckets
}

package traffic

import (
	"cmp"
	"slices"
	"time"
)

const (
	// LiveStep is the length of a step of the live record.
	LiveStep = 5 * time.Second
	// LiveSpan is how far back the live record reaches.
	LiveSpan = 10 * time.Minute
	// LiveGap is the longest stretch between two readings the live record
	// takes. A longer one, such as the time the daemon was stopped, starts it
	// over: where in that stretch the traffic passed is not known to the step.
	LiveGap = time.Minute
)

// LiveCounts is one provider's traffic in one step of the live record.
type LiveCounts struct {
	// Index counts steps from the first step of the record.
	Index    int
	Provider string
	Counts
}

// Live is the last LiveSpan of traffic by provider in steps of LiveStep, as
// the readings found it. It is held in memory, so a daemon that starts again
// starts it empty. The zero value is an empty record. It is not safe for
// concurrent use.
type Live struct {
	// since is where the record begins; at is the last reading.
	since, at time.Time
	// steps holds each step's traffic by provider, keyed by when the step
	// begins in Unix milliseconds.
	steps map[int64]map[string]Counts
}

// Add records what passed between two readings, by provider, under the steps
// the stretch overlaps, in proportion to the overlap. A stretch that does not
// begin at the last reading, or is longer than LiveGap, starts the record over
// at its end, with nothing in it.
func (l *Live) Add(from, to time.Time, passed map[Key]Counts) {
	from, to = from.UTC(), to.UTC()

	switch {
	case to.Before(from) || to.Sub(from) > LiveGap:
		l.reset(to)

		return
	case l.at.IsZero() || !from.Equal(l.at):
		l.reset(from)
	}

	byProvider := map[string]Counts{}
	for key, counts := range passed {
		byProvider[key.Provider] = byProvider[key.Provider].Add(counts)
	}

	for _, part := range overlaps(from, to) {
		step := l.steps[part.start]
		if step == nil {
			step = map[string]Counts{}
			l.steps[part.start] = step
		}

		for provider, counts := range byProvider {
			if share := counts.portion(part.before, part.through, part.whole); !share.IsZero() {
				step[provider] = step[provider].Add(share)
			}
		}
	}

	l.at = to
	l.prune()
}

// Series returns the record from its first step to the step holding the last
// reading, which is still filling: when the first step begins, how many
// steps there are, and each provider's traffic in each step that has any,
// in step then provider order. An empty record has no steps.
func (l *Live) Series() (start time.Time, steps int, counts []LiveCounts) {
	if l.at.IsZero() {
		return time.Time{}, 0, nil
	}

	first, last := l.since.Truncate(LiveStep), l.at.Truncate(LiveStep)
	steps = int(last.Sub(first)/LiveStep) + 1

	for at, step := range l.steps {
		index := int(time.UnixMilli(at).UTC().Sub(first) / LiveStep)
		if index < 0 || index >= steps {
			continue
		}

		for provider, c := range step {
			counts = append(counts, LiveCounts{Index: index, Provider: provider, Counts: c})
		}
	}

	slices.SortFunc(counts, func(x, y LiveCounts) int {
		return cmp.Or(cmp.Compare(x.Index, y.Index), cmp.Compare(x.Provider, y.Provider))
	})

	return first, steps, counts
}

// reset empties the record and begins it at the given time.
func (l *Live) reset(at time.Time) {
	l.since, l.at = at, at
	l.steps = map[int64]map[string]Counts{}
}

// prune drops the steps that begin more than LiveSpan before the last
// reading's step, and moves the record's beginning up to the first it keeps.
func (l *Live) prune() {
	cutoff := l.at.Truncate(LiveStep).Add(-LiveSpan + LiveStep)

	for at := range l.steps {
		if time.UnixMilli(at).Before(cutoff) {
			delete(l.steps, at)
		}
	}

	if l.since.Before(cutoff) {
		l.since = cutoff
	}
}

// overlap is the part of a stretch that falls in one step, in milliseconds
// of the stretch: the step begins at start, and the stretch has run before
// milliseconds when it enters the step and through when it leaves, of whole.
type overlap struct {
	start                  int64
	before, through, whole int64
}

// overlaps cuts the stretch from `from` to `to` at the step boundaries. A
// stretch of no length is one part, wholly in the step holding it.
func overlaps(from, to time.Time) []overlap {
	whole := to.Sub(from).Milliseconds()
	if whole <= 0 {
		return []overlap{{start: to.Truncate(LiveStep).UnixMilli(), before: 0, through: 1, whole: 1}}
	}

	var parts []overlap

	for step := from.Truncate(LiveStep); step.Before(to); step = step.Add(LiveStep) {
		enter := max(0, step.Sub(from).Milliseconds())
		leave := min(whole, step.Add(LiveStep).Sub(from).Milliseconds())

		if leave > enter {
			parts = append(parts, overlap{start: step.UnixMilli(), before: enter, through: leave, whole: whole})
		}
	}

	return parts
}

// portion returns the part of c that falls between before and through out of
// whole, cutting each count at the same running marks, so the portions of
// one stretch add up to c exactly.
func (c Counts) portion(before, through, whole int64) Counts {
	part := func(total int64) int64 {
		return total*through/whole - total*before/whole
	}

	return Counts{
		Requests:         part(c.Requests),
		InputTokens:      part(c.InputTokens),
		OutputTokens:     part(c.OutputTokens),
		CacheReadTokens:  part(c.CacheReadTokens),
		CacheWriteTokens: part(c.CacheWriteTokens),
		CostUSD:          c.CostUSD * float64(through-before) / float64(whole),
	}
}

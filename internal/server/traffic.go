package server

import (
	"cmp"
	"context"
	"slices"
	"time"

	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/collector"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/traffic"
)

// The two series getTraffic serves: the last hour by minute and the last
// week by hour. The last step of each is the one still filling.
const (
	minuteSteps = 60
	hourSteps   = 7 * 24
)

// Collector is what the server reads from the traffic collector.
type Collector interface {
	// Status returns how the last collection went.
	Status() collector.Status
	// Subscribe returns a channel that receives after each collection, and
	// a function that ends the subscription.
	Subscribe() (changed <-chan struct{}, cancel func())
}

// TrafficRecord reads recorded traffic.
type TrafficRecord interface {
	// TrafficSeries returns each provider's traffic from start in steps;
	// with measuredOnly, without the estimates.
	TrafficSeries(
		ctx context.Context, start time.Time, step time.Duration, steps int, measuredOnly bool,
	) ([]store.TrafficStep, error)
	// TrafficTotals returns each stream's traffic at or after since; with
	// measuredOnly, without the estimates.
	TrafficTotals(ctx context.Context, since time.Time, measuredOnly bool) ([]store.TrafficTotal, error)
	// TrafficMeasuredSince returns when traffic began to be measured; zero
	// before the first reading.
	TrafficMeasuredSince(ctx context.Context) (time.Time, error)
}

func (a *operations) GetTraffic(ctx context.Context) (*rest.Traffic, error) {
	return a.traffic(ctx)
}

// traffic is what is passing through the gateway: served by GetTraffic and
// sent on the event stream.
func (a *operations) traffic(ctx context.Context) (*rest.Traffic, error) {
	now := a.now().UTC()
	minutesFrom := now.Truncate(time.Minute).Add(-(minuteSteps - 1) * time.Minute)
	hoursFrom := now.Truncate(time.Hour).Add(-(hourSteps - 1) * time.Hour)

	out := &rest.Traffic{
		Windows: []rest.TrafficWindow{},
		Minutes: series(minutesFrom, time.Minute, minuteSteps, nil),
		Hours:   series(hoursFrom, time.Hour, hourSteps, nil),
		Clients: []rest.TrafficClient{},
	}

	if a.collector == nil {
		return out, nil
	}

	out.Available = true

	status := a.collector.Status()
	if !status.UpdatedAt.IsZero() {
		out.UpdatedAt = rest.NewOptDateTime(status.UpdatedAt.UTC())
	}

	if status.Err != "" {
		out.Error = rest.NewOptString(status.Err)
	}

	measuredSince, err := a.trafficRecord.TrafficMeasuredSince(ctx)
	if err != nil {
		return nil, err
	}

	if !measuredSince.IsZero() {
		out.MeasuredSince = rest.NewOptDateTime(measuredSince.UTC())
	}

	// An estimate is known to the hour at best, so it has no place in the
	// last hour's total or in the series by minute.
	windows := []struct {
		id           rest.TrafficWindowID
		since        time.Time
		measuredOnly bool
	}{
		{rest.TrafficWindowIDHour, now.Add(-time.Hour), true},
		{rest.TrafficWindowIDDay, now.Add(-24 * time.Hour), false},
		{rest.TrafficWindowIDWeek, now.Add(-7 * 24 * time.Hour), false},
	}

	for _, w := range windows {
		totals, totalsErr := a.trafficRecord.TrafficTotals(ctx, w.since, w.measuredOnly)
		if totalsErr != nil {
			return nil, totalsErr
		}

		out.Windows = append(out.Windows, window(w.id, w.since, totals))

		if w.id == rest.TrafficWindowIDWeek {
			for _, t := range totals {
				out.Clients = append(out.Clients, rest.TrafficClient{
					InstallId: t.InstallID, Hostname: t.Hostname, App: t.App, Provider: t.Provider, Counts: counts(t.Counts),
				})
			}
		}
	}

	minutes, err := a.trafficRecord.TrafficSeries(ctx, minutesFrom, time.Minute, minuteSteps, true)
	if err != nil {
		return nil, err
	}

	hours, err := a.trafficRecord.TrafficSeries(ctx, hoursFrom, time.Hour, hourSteps, false)
	if err != nil {
		return nil, err
	}

	out.Minutes = series(minutesFrom, time.Minute, minuteSteps, minutes)
	out.Hours = series(hoursFrom, time.Hour, hourSteps, hours)

	return out, nil
}

func counts(c traffic.Counts) rest.TrafficCounts {
	return rest.TrafficCounts{
		Requests:         int(c.Requests),
		InputTokens:      int(c.InputTokens),
		OutputTokens:     int(c.OutputTokens),
		CacheReadTokens:  int(c.CacheReadTokens),
		CacheWriteTokens: int(c.CacheWriteTokens),
		CostUsd:          c.CostUSD,
	}
}

// window sums a period's streams in total and by provider, the costliest
// provider first.
func window(id rest.TrafficWindowID, since time.Time, totals []store.TrafficTotal) rest.TrafficWindow {
	var (
		total      traffic.Counts
		byProvider = map[string]traffic.Counts{}
		order      []string
	)

	for _, t := range totals {
		total = total.Add(t.Counts)

		if _, seen := byProvider[t.Provider]; !seen {
			order = append(order, t.Provider)
		}

		byProvider[t.Provider] = byProvider[t.Provider].Add(t.Counts)
	}

	slices.SortStableFunc(order, func(x, y string) int {
		return cmp.Or(cmp.Compare(byProvider[y].CostUSD, byProvider[x].CostUSD), cmp.Compare(x, y))
	})

	out := rest.TrafficWindow{
		ID: id, Since: since, Total: counts(total), Providers: make([]rest.TrafficProviderCounts, 0, len(order)),
	}

	for _, provider := range order {
		out.Providers = append(out.Providers, rest.TrafficProviderCounts{Provider: provider, Counts: counts(byProvider[provider])})
	}

	return out
}

// series lays a provider's steps out as one value per step, the costliest
// provider first.
func series(start time.Time, step time.Duration, steps int, points []store.TrafficStep) rest.TrafficSeries {
	out := rest.TrafficSeries{
		Start: start, StepSeconds: int(step / time.Second), Steps: steps, Providers: []rest.TrafficProviderSeries{},
	}

	index := map[string]int{}
	cost := map[string]float64{}

	for _, p := range points {
		if p.Index < 0 || p.Index >= steps {
			continue
		}

		at, seen := index[p.Provider]
		if !seen {
			at = len(out.Providers)
			index[p.Provider] = at
			out.Providers = append(out.Providers, rest.TrafficProviderSeries{
				Provider: p.Provider,
				Requests: make([]int, steps),
				Tokens:   make([]int, steps),
				CostUsd:  make([]float64, steps),
			})
		}

		out.Providers[at].Requests[p.Index] += int(p.Requests)
		out.Providers[at].Tokens[p.Index] += int(p.Tokens())
		out.Providers[at].CostUsd[p.Index] += p.CostUSD
		cost[p.Provider] += p.CostUSD
	}

	slices.SortStableFunc(out.Providers, func(x, y rest.TrafficProviderSeries) int {
		return cmp.Or(cmp.Compare(cost[y.Provider], cost[x.Provider]), cmp.Compare(x.Provider, y.Provider))
	})

	return out
}

// Package collector keeps the traffic record up to date from an omp broker.
package collector

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/savid/oh-my-usage/pkg/traffic"
)

const (
	// collectTimeout bounds one collection. The first asks the broker a
	// couple of hundred questions to estimate the last seven days.
	collectTimeout = 2 * time.Minute
	// pruneEvery is how often old traffic is deleted.
	pruneEvery = time.Hour
)

// Broker is what the collector asks an omp auth broker.
type Broker interface {
	// ClientUsage returns the running totals by stream; with a since, only
	// of the bursts of traffic that ended at or after it.
	ClientUsage(ctx context.Context, since time.Time) (traffic.Summary, error)
}

// Record is where the collector keeps traffic.
type Record interface {
	TrafficReading(ctx context.Context) (time.Time, map[traffic.Key]traffic.Counts, error)
	AddTraffic(ctx context.Context, buckets []traffic.Bucket, at time.Time, totals map[traffic.Key]traffic.Counts) error
	PruneTraffic(ctx context.Context, before time.Time) (int64, error)
}

// Config holds what a Collector needs.
type Config struct {
	Broker Broker
	Record Record
	// Interval is the time between collections.
	Interval time.Duration
	// Retention is how long traffic is kept; zero keeps it forever.
	Retention time.Duration
	// Now returns the current time; nil takes time.Now. Tests set it.
	Now func() time.Time
}

// Status is how the last collection went.
type Status struct {
	// UpdatedAt is the last successful collection; zero before the first.
	UpdatedAt time.Time
	// Err is why the last collection failed; empty when it succeeded.
	Err string
}

// Collector owns the collection loop.
type Collector struct {
	log *slog.Logger
	cfg Config

	// collecting serialises collections.
	collecting sync.Mutex
	prunedAt   time.Time

	mu          sync.Mutex
	status      Status
	subscribers map[chan struct{}]struct{}
}

// New returns a Collector that has not collected yet.
func New(log *slog.Logger, cfg Config) *Collector {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	return &Collector{log: log, cfg: cfg, subscribers: map[chan struct{}]struct{}{}}
}

// Run collects once, then every Interval, until ctx is cancelled.
func (c *Collector) Run(ctx context.Context) {
	c.Collect(ctx)

	ticker := time.NewTicker(c.cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.Collect(ctx)
		}
	}
}

// Status returns how the last collection went.
func (c *Collector) Status() Status {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.status
}

// Subscribe returns a channel that receives after each collection, and a
// function that ends the subscription. A slow reader misses collections,
// never blocks one.
func (c *Collector) Subscribe() (changed <-chan struct{}, cancel func()) {
	ch := make(chan struct{}, 1)

	c.mu.Lock()
	c.subscribers[ch] = struct{}{}
	c.mu.Unlock()

	return ch, func() {
		c.mu.Lock()
		delete(c.subscribers, ch)
		c.mu.Unlock()
	}
}

// Collect brings the record up to now and tells the subscribers. A failed
// collection stores nothing, so the next one covers its stretch too.
func (c *Collector) Collect(ctx context.Context) {
	c.collecting.Lock()
	defer c.collecting.Unlock()

	ctx, cancel := context.WithTimeout(ctx, collectTimeout)
	defer cancel()

	now := c.cfg.Now()
	err := c.collect(ctx, now)

	c.mu.Lock()
	previous := c.status

	if err == nil {
		c.status = Status{UpdatedAt: now.UTC()}
	} else {
		c.status = Status{UpdatedAt: previous.UpdatedAt, Err: err.Error()}
	}

	for ch := range c.subscribers {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	c.mu.Unlock()

	// Log only when the outcome changes.
	switch {
	case err == nil && previous.Err != "":
		c.log.InfoContext(ctx, "traffic collecting again")
	case err != nil && previous.Err != err.Error():
		c.log.WarnContext(ctx, "traffic not collected", "error", err)
	}

	if err == nil {
		c.prune(ctx, now)
	}
}

// collect reads the broker's running totals and stores how much they grew
// since the last reading. The first reading has nothing to compare with: it
// stores an estimate of the days before it instead.
func (c *Collector) collect(ctx context.Context, now time.Time) error {
	last, totals, err := c.cfg.Record.TrafficReading(ctx)
	if err != nil {
		return err
	}

	reading, err := c.cfg.Broker.ClientUsage(ctx, time.Time{})
	if err != nil {
		return err
	}

	// The broker's clock dates the reading, so the stretch between two
	// readings is measured on one clock. Time never runs backwards here.
	at := reading.GeneratedAt
	if at.IsZero() {
		at = now
	}

	if at.Before(last) {
		at = last
	}

	var buckets []traffic.Bucket

	if last.IsZero() {
		if buckets, err = c.backfill(ctx, now); err != nil {
			return err
		}

		c.log.InfoContext(ctx, "traffic history estimated", "buckets", len(buckets))
	} else {
		buckets = traffic.Spread(last, at, traffic.Delta(totals, reading.Counts), reading.Hostnames)
	}

	if err = c.cfg.Record.AddTraffic(ctx, buckets, at, reading.Counts); err != nil {
		return fmt.Errorf("store traffic: %w", err)
	}

	return nil
}

// backfill estimates the traffic of the days before the first reading from
// when each burst of it ended.
func (c *Collector) backfill(ctx context.Context, now time.Time) ([]traffic.Bucket, error) {
	marks := traffic.BackfillMarks(now)
	summaries := make([]traffic.Summary, 0, len(marks))

	for _, mark := range marks {
		summary, err := c.cfg.Broker.ClientUsage(ctx, mark)
		if err != nil {
			return nil, err
		}

		summaries = append(summaries, summary)
	}

	return traffic.Backfill(marks, summaries), nil
}

func (c *Collector) prune(ctx context.Context, now time.Time) {
	if c.cfg.Retention <= 0 || now.Sub(c.prunedAt) < pruneEvery {
		return
	}

	c.prunedAt = now

	if _, err := c.cfg.Record.PruneTraffic(ctx, now.Add(-c.cfg.Retention)); err != nil {
		c.log.WarnContext(ctx, "prune traffic", "error", err)
	}
}

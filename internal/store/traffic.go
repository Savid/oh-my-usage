package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/savid/oh-my-usage/pkg/traffic"
)

// trafficColumns are the six counts, in the order every traffic statement
// reads and writes them.
const trafficColumns = "requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd"

// trafficSums adds those columns up, in the same order.
const trafficSums = `SUM(requests), SUM(input_tokens), SUM(output_tokens),
	SUM(cache_read_tokens), SUM(cache_write_tokens), SUM(cost_usd)`

func countArgs(c traffic.Counts) []any {
	return []any{c.Requests, c.InputTokens, c.OutputTokens, c.CacheReadTokens, c.CacheWriteTokens, c.CostUSD}
}

func countTargets(c *traffic.Counts) []any {
	return []any{&c.Requests, &c.InputTokens, &c.OutputTokens, &c.CacheReadTokens, &c.CacheWriteTokens, &c.CostUSD}
}

// TrafficReading returns the last reading of the broker's running totals and
// when it was taken. Before the first reading the time is zero.
func (s *Store) TrafficReading(ctx context.Context) (time.Time, map[traffic.Key]traffic.Counts, error) {
	var at int64

	err := s.db.QueryRowContext(ctx, "SELECT at FROM traffic_reading WHERE id = 1").Scan(&at)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, nil, nil
	}

	if err != nil {
		return time.Time{}, nil, fmt.Errorf("read traffic reading: %w", err)
	}

	rows, err := s.db.QueryContext(ctx, "SELECT install_id, app, provider, "+trafficColumns+" FROM traffic_totals")
	if err != nil {
		return time.Time{}, nil, fmt.Errorf("query traffic totals: %w", err)
	}

	defer func() { _ = rows.Close() }()

	totals := map[traffic.Key]traffic.Counts{}

	for rows.Next() {
		var (
			key    traffic.Key
			counts traffic.Counts
		)

		if err = rows.Scan(append([]any{&key.InstallID, &key.App, &key.Provider}, countTargets(&counts)...)...); err != nil {
			return time.Time{}, nil, fmt.Errorf("scan traffic totals: %w", err)
		}

		totals[key] = counts
	}

	if err = rows.Err(); err != nil {
		return time.Time{}, nil, fmt.Errorf("read traffic totals: %w", err)
	}

	return time.UnixMilli(at).UTC(), totals, nil
}

// TrafficMeasuredSince returns when the first reading was taken: traffic
// from then on is measured, and what is recorded before it is an estimate.
// It is zero before the first reading.
func (s *Store) TrafficMeasuredSince(ctx context.Context) (time.Time, error) {
	var since int64

	err := s.db.QueryRowContext(ctx, "SELECT since FROM traffic_reading WHERE id = 1").Scan(&since)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, nil
	}

	if err != nil {
		return time.Time{}, fmt.Errorf("read traffic reading: %w", err)
	}

	return time.UnixMilli(since).UTC(), nil
}

// AddTraffic adds buckets to the record and replaces the last reading, as
// one change: a reading is stored whole or not at all, so its traffic is
// never counted twice. A bucket already stored for its minute and stream
// adds to it.
func (s *Store) AddTraffic(
	ctx context.Context, buckets []traffic.Bucket, at time.Time, totals map[traffic.Key]traffic.Counts,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err = addBuckets(ctx, tx, buckets); err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, "DELETE FROM traffic_totals"); err != nil {
		return fmt.Errorf("clear traffic totals: %w", err)
	}

	for key, counts := range totals {
		if _, err = tx.ExecContext(ctx,
			"INSERT INTO traffic_totals (install_id, app, provider, "+trafficColumns+") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			append([]any{key.InstallID, key.App, key.Provider}, countArgs(counts)...)...); err != nil {
			return fmt.Errorf("store traffic totals: %w", err)
		}
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO traffic_reading (id, at, since) VALUES (1, ?, ?)
		ON CONFLICT (id) DO UPDATE SET at = excluded.at`, at.UnixMilli(), at.UnixMilli()); err != nil {
		return fmt.Errorf("store traffic reading: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	return nil
}

func addBuckets(ctx context.Context, tx *sql.Tx, buckets []traffic.Bucket) error {
	if len(buckets) == 0 {
		return nil
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO traffic (bucket_start, estimated, install_id, app, provider, hostname, `+trafficColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (bucket_start, estimated, install_id, app, provider) DO UPDATE SET
			hostname           = excluded.hostname,
			requests           = requests + excluded.requests,
			input_tokens       = input_tokens + excluded.input_tokens,
			output_tokens      = output_tokens + excluded.output_tokens,
			cache_read_tokens  = cache_read_tokens + excluded.cache_read_tokens,
			cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
			cost_usd           = cost_usd + excluded.cost_usd`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}

	defer func() { _ = stmt.Close() }()

	for _, b := range buckets {
		args := append([]any{b.Start.Truncate(time.Minute).UnixMilli(), b.Estimated, b.InstallID, b.App, b.Provider, b.Hostname},
			countArgs(b.Counts)...)
		if _, err = stmt.ExecContext(ctx, args...); err != nil {
			return fmt.Errorf("add traffic: %w", err)
		}
	}

	return nil
}

// measuredFilter narrows a traffic query to what was measured when its
// parameter is true, leaving estimates out; otherwise it lets everything by.
const measuredFilter = " AND (NOT ? OR estimated = 0)"

// TrafficStep is one provider's traffic in one step of a series.
type TrafficStep struct {
	// Index counts steps from the start of the series.
	Index    int
	Provider string
	traffic.Counts
}

// TrafficSeries returns each provider's traffic from start, cut into steps
// of the given length. Steps and providers with no traffic are left out.
// With measuredOnly, estimates are too: they are known to the hour at best.
func (s *Store) TrafficSeries(
	ctx context.Context, start time.Time, step time.Duration, steps int, measuredOnly bool,
) ([]TrafficStep, error) {
	from, width := start.UnixMilli(), max(1, step.Milliseconds())

	rows, err := s.db.QueryContext(ctx, `
		SELECT (bucket_start - ?) / ?, provider, `+trafficSums+`
		FROM traffic
		WHERE bucket_start >= ? AND bucket_start < ?`+measuredFilter+`
		GROUP BY 1, 2
		ORDER BY 2, 1`, from, width, from, from+width*int64(steps), measuredOnly)
	if err != nil {
		return nil, fmt.Errorf("query traffic series: %w", err)
	}

	defer func() { _ = rows.Close() }()

	out := []TrafficStep{}

	for rows.Next() {
		var point TrafficStep
		if err = rows.Scan(append([]any{&point.Index, &point.Provider}, countTargets(&point.Counts)...)...); err != nil {
			return nil, fmt.Errorf("scan traffic step: %w", err)
		}

		out = append(out, point)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("read traffic series: %w", err)
	}

	return out, nil
}

// TrafficTotal is one stream's traffic over a period.
type TrafficTotal struct {
	traffic.Key
	Hostname string
	traffic.Counts
}

// TrafficTotals returns each stream's traffic at or after since, the
// costliest first. With measuredOnly, estimates are left out.
func (s *Store) TrafficTotals(ctx context.Context, since time.Time, measuredOnly bool) ([]TrafficTotal, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT install_id, app, provider, MAX(hostname), `+trafficSums+`
		FROM traffic
		WHERE bucket_start >= ?`+measuredFilter+`
		GROUP BY install_id, app, provider
		ORDER BY SUM(cost_usd) DESC, SUM(requests) DESC, provider, install_id, app`, since.UnixMilli(), measuredOnly)
	if err != nil {
		return nil, fmt.Errorf("query traffic totals: %w", err)
	}

	defer func() { _ = rows.Close() }()

	out := []TrafficTotal{}

	for rows.Next() {
		var total TrafficTotal

		targets := append([]any{&total.InstallID, &total.App, &total.Provider, &total.Hostname}, countTargets(&total.Counts)...)
		if err = rows.Scan(targets...); err != nil {
			return nil, fmt.Errorf("scan traffic total: %w", err)
		}

		out = append(out, total)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("read traffic totals: %w", err)
	}

	return out, nil
}

// PruneTraffic deletes traffic older than before and reports how many rows.
func (s *Store) PruneTraffic(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, "DELETE FROM traffic WHERE bucket_start < ?", before.UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("prune traffic: %w", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("prune traffic: %w", err)
	}

	return n, nil
}

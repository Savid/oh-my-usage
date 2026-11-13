// Package store keeps the usage history and the traffic record in a SQLite
// file.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"time"

	_ "modernc.org/sqlite" // registers the pure-Go "sqlite" driver
)

// migrations holds the schema, one step per version: migrations[n] takes a
// database from PRAGMA user_version n to n+1.
var migrations = []string{
	// 1: usage samples. A sample's key is its account, limit and the
	// provider's own report time, so recording a report twice stores it once.
	`
CREATE TABLE usage_samples (
	account_id    TEXT    NOT NULL,
	limit_id      TEXT    NOT NULL,
	recorded_at   INTEGER NOT NULL, -- Unix milliseconds
	provider      TEXT    NOT NULL,
	label         TEXT    NOT NULL,
	used_fraction REAL    NOT NULL,
	status        TEXT    NOT NULL,
	resets_at     INTEGER,          -- Unix milliseconds
	PRIMARY KEY (account_id, limit_id, recorded_at)
) WITHOUT ROWID;
CREATE INDEX usage_samples_recorded_at ON usage_samples (recorded_at);
`,
	// 2: traffic by minute (or by hour, when estimated) and stream; the
	// broker's running totals at the last reading; and when that was.
	`
CREATE TABLE traffic (
	bucket_start       INTEGER NOT NULL, -- Unix milliseconds, on the minute
	estimated          INTEGER NOT NULL, -- 1 when its place in time is a guess
	install_id         TEXT    NOT NULL,
	app                TEXT    NOT NULL,
	provider           TEXT    NOT NULL,
	hostname           TEXT    NOT NULL,
	requests           INTEGER NOT NULL,
	input_tokens       INTEGER NOT NULL,
	output_tokens      INTEGER NOT NULL,
	cache_read_tokens  INTEGER NOT NULL,
	cache_write_tokens INTEGER NOT NULL,
	cost_usd           REAL    NOT NULL,
	PRIMARY KEY (bucket_start, estimated, install_id, app, provider)
) WITHOUT ROWID;
CREATE TABLE traffic_totals (
	install_id         TEXT    NOT NULL,
	app                TEXT    NOT NULL,
	provider           TEXT    NOT NULL,
	requests           INTEGER NOT NULL,
	input_tokens       INTEGER NOT NULL,
	output_tokens      INTEGER NOT NULL,
	cache_read_tokens  INTEGER NOT NULL,
	cache_write_tokens INTEGER NOT NULL,
	cost_usd           REAL    NOT NULL,
	PRIMARY KEY (install_id, app, provider)
) WITHOUT ROWID;
CREATE TABLE traffic_reading (
	id    INTEGER PRIMARY KEY CHECK (id = 1),
	at    INTEGER NOT NULL, -- Unix milliseconds: the last reading
	since INTEGER NOT NULL  -- Unix milliseconds: the first reading
);
`,
}

// Sample is one limit of one account at the time its provider reported it.
type Sample struct {
	AccountID    string
	LimitID      string
	At           time.Time
	Provider     string
	Label        string
	UsedFraction float64
	Status       string
	// ResetsAt is zero when the provider gave no reset time.
	ResetsAt time.Time
}

// Store is the open history database.
type Store struct {
	db *sql.DB
}

// Open opens the database at path, creating it and its schema when new. It
// refuses a file written by a newer build.
func Open(ctx context.Context, path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("database path is empty")
	}

	query := url.Values{"_pragma": {"busy_timeout(5000)", "journal_mode(WAL)", "synchronous(NORMAL)"}}

	db, err := sql.Open("sqlite", "file:"+path+"?"+query.Encode())
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	// One connection: writes are rare and small, and SQLite allows one writer.
	db.SetMaxOpenConns(1)

	if err = migrate(ctx, db); err != nil {
		_ = db.Close()

		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	return &Store{db: db}, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	var version int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}

	if version > len(migrations) {
		return fmt.Errorf("schema version %d is newer than this build's %d", version, len(migrations))
	}

	for ; version < len(migrations); version++ {
		if err := step(ctx, db, version); err != nil {
			return fmt.Errorf("migrate to schema version %d: %w", version+1, err)
		}
	}

	return nil
}

// step applies migrations[from] and records the new version, together.
func step(ctx context.Context, db *sql.DB, from int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx, migrations[from]); err != nil {
		return fmt.Errorf("apply: %w", err)
	}

	// PRAGMA takes no parameters; the version is this build's own integer.
	if _, err = tx.ExecContext(ctx, "PRAGMA user_version = "+strconv.Itoa(from+1)); err != nil {
		return fmt.Errorf("set version: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	return nil
}

// Close closes the database.
func (s *Store) Close() error {
	if err := s.db.Close(); err != nil {
		return fmt.Errorf("close database: %w", err)
	}

	return nil
}

// Record stores samples, skipping any already stored.
func (s *Store) Record(ctx context.Context, samples []Sample) error {
	if len(samples) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT OR IGNORE INTO usage_samples
			(account_id, limit_id, recorded_at, provider, label, used_fraction, status, resets_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}

	defer func() { _ = stmt.Close() }()

	for _, sample := range samples {
		var resetsAt sql.NullInt64
		if !sample.ResetsAt.IsZero() {
			resetsAt = sql.NullInt64{Int64: sample.ResetsAt.UnixMilli(), Valid: true}
		}

		if _, err = stmt.ExecContext(ctx, sample.AccountID, sample.LimitID, sample.At.UnixMilli(),
			sample.Provider, sample.Label, sample.UsedFraction, sample.Status, resetsAt); err != nil {
			return fmt.Errorf("insert sample: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	return nil
}

// History returns an account's samples at or after since, oldest first.
func (s *Store) History(ctx context.Context, accountID string, since time.Time) ([]Sample, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT limit_id, recorded_at, provider, label, used_fraction, status, resets_at
		FROM usage_samples
		WHERE account_id = ? AND recorded_at >= ?
		ORDER BY recorded_at, limit_id`, accountID, since.UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("query history: %w", err)
	}

	defer func() { _ = rows.Close() }()

	samples := []Sample{}

	for rows.Next() {
		var (
			sample     = Sample{AccountID: accountID}
			recordedAt int64
			resetsAt   sql.NullInt64
		)

		if err = rows.Scan(&sample.LimitID, &recordedAt, &sample.Provider, &sample.Label,
			&sample.UsedFraction, &sample.Status, &resetsAt); err != nil {
			return nil, fmt.Errorf("scan sample: %w", err)
		}

		sample.At = time.UnixMilli(recordedAt).UTC()
		if resetsAt.Valid {
			sample.ResetsAt = time.UnixMilli(resetsAt.Int64).UTC()
		}

		samples = append(samples, sample)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("read history: %w", err)
	}

	return samples, nil
}

// Trend is one limit of one account over time, oldest first.
type Trend struct {
	AccountID string
	LimitID   string
	Points    []TrendPoint
}

// TrendPoint is a limit's used share at a moment.
type TrendPoint struct {
	At           time.Time
	UsedFraction float64
}

// Trends returns every limit's samples from since to until, thinned for a
// small chart: the time from the first sample in that period to until is cut
// into equal steps and each keeps its first sample, so a chart starts where
// the history does. Starting at the first sample also keeps a short history
// from collapsing into one step of a long period.
func (s *Store) Trends(ctx context.Context, since, until time.Time, steps int) ([]Trend, error) {
	var first sql.NullInt64

	err := s.db.QueryRowContext(ctx,
		"SELECT MIN(recorded_at) FROM usage_samples WHERE recorded_at >= ? AND recorded_at <= ?",
		since.UnixMilli(), until.UnixMilli()).Scan(&first)
	if err != nil {
		return nil, fmt.Errorf("query trends: %w", err)
	}

	if !first.Valid {
		return []Trend{}, nil
	}

	start := first.Int64
	width := max(1, (until.UnixMilli()-start)/int64(max(1, steps))+1)

	// With one MIN() in the list, SQLite takes the other columns from the row
	// that holds the minimum: here, each step's first sample.
	rows, err := s.db.QueryContext(ctx, `
		SELECT account_id, limit_id, MIN(recorded_at), used_fraction
		FROM usage_samples
		WHERE recorded_at >= ? AND recorded_at <= ?
		GROUP BY account_id, limit_id, (recorded_at - ?) / ?
		ORDER BY account_id, limit_id, 3`, start, until.UnixMilli(), start, width)
	if err != nil {
		return nil, fmt.Errorf("query trends: %w", err)
	}

	defer func() { _ = rows.Close() }()

	trends := []Trend{}

	for rows.Next() {
		var (
			accountID, limitID string
			recordedAt         int64
			used               float64
		)

		if err = rows.Scan(&accountID, &limitID, &recordedAt, &used); err != nil {
			return nil, fmt.Errorf("scan trend: %w", err)
		}

		if n := len(trends); n == 0 || trends[n-1].AccountID != accountID || trends[n-1].LimitID != limitID {
			trends = append(trends, Trend{AccountID: accountID, LimitID: limitID})
		}

		last := &trends[len(trends)-1]
		last.Points = append(last.Points, TrendPoint{At: time.UnixMilli(recordedAt).UTC(), UsedFraction: used})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("read trends: %w", err)
	}

	return trends, nil
}

// Prune deletes samples older than before and reports how many.
func (s *Store) Prune(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, "DELETE FROM usage_samples WHERE recorded_at < ?", before.UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("prune: %w", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("prune: %w", err)
	}

	return n, nil
}

// Package store keeps the usage history in a SQLite file.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"time"

	_ "modernc.org/sqlite" // registers the pure-Go "sqlite" driver
)

// schemaVersion is the PRAGMA user_version this build reads and writes.
const schemaVersion = 1

// schema creates version 1. A sample's key is its account, limit and the
// provider's own report time, so recording a report twice stores it once.
const schema = `
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
PRAGMA user_version = 1;
`

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

	switch {
	case version == schemaVersion:
		return nil
	case version > schemaVersion:
		return fmt.Errorf("schema version %d is newer than this build's %d", version, schemaVersion)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx, schema); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit migration: %w", err)
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

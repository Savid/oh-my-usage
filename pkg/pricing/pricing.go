// Package pricing says what each account's subscription costs a month. omp
// does not report prices, so they come from a file the operator writes:
//
//	{
//	  "providers": {"anthropic": 200},
//	  "plans": {"openai-codex": {"pro": 200, "plus": 20}},
//	  "accounts": {"ar25@example.com": 50, "claude-*@example.com": 50, "3f6c2a9d41b07e58": 100}
//	}
//
// It is pure: the caller reads the file and hands its bytes to Parse.
package pricing

import (
	"bytes"
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"slices"
	"strings"

	"github.com/savid/oh-my-usage/pkg/accounts"
)

// Table holds the prices of a price file. The zero Table prices nothing.
type Table struct {
	providers map[string]float64
	// plans is keyed by provider, then by the lowercased plan.
	plans map[string]map[string]float64
	// ids and emails hold the account keys that are not patterns: ids as
	// written, emails lowercased.
	ids    map[string]float64
	emails map[string]float64
	// patterns are the account keys that are globs, longest first, ties in
	// lexical order.
	patterns []pattern
}

type pattern struct {
	glob  string
	lower string
	price float64
}

// file is the price file's shape.
type file struct {
	Providers map[string]float64            `json:"providers"`
	Plans     map[string]map[string]float64 `json:"plans"`
	Accounts  map[string]float64            `json:"accounts"`
}

// Parse reads a price file. It rejects unknown top-level keys, negative
// prices, empty keys, malformed patterns and account or plan keys that differ
// only in case; each error names the entry at fault.
func Parse(data []byte) (Table, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var f file
	if err := dec.Decode(&f); err != nil {
		return Table{}, fmt.Errorf("prices: %w", err)
	}

	if dec.More() {
		return Table{}, errors.New("prices: unexpected data after the JSON object")
	}

	t := Table{
		providers: make(map[string]float64, len(f.Providers)),
		plans:     make(map[string]map[string]float64, len(f.Plans)),
		ids:       make(map[string]float64),
		emails:    make(map[string]float64),
	}

	for provider, price := range f.Providers {
		if err := check(fmt.Sprintf("providers[%q]", provider), provider, price); err != nil {
			return Table{}, err
		}

		t.providers[provider] = price
	}

	for provider, plans := range f.Plans {
		if provider == "" {
			return Table{}, errors.New(`prices: plans[""]: empty provider`)
		}

		byPlan := make(map[string]float64, len(plans))
		for plan, price := range plans {
			entry := fmt.Sprintf("plans[%q][%q]", provider, plan)
			if err := check(entry, plan, price); err != nil {
				return Table{}, err
			}

			key := strings.ToLower(plan)
			if _, dup := byPlan[key]; dup {
				return Table{}, fmt.Errorf("prices: %s: another plan differs only in case", entry)
			}

			byPlan[key] = price
		}

		t.plans[provider] = byPlan
	}

	for key, price := range f.Accounts {
		if err := t.addAccount(key, price); err != nil {
			return Table{}, err
		}
	}

	slices.SortFunc(t.patterns, func(a, b pattern) int {
		return cmp.Or(cmp.Compare(len(b.glob), len(a.glob)), cmp.Compare(a.glob, b.glob))
	})

	return t, nil
}

func (t *Table) addAccount(key string, price float64) error {
	entry := fmt.Sprintf("accounts[%q]", key)
	if err := check(entry, key, price); err != nil {
		return err
	}

	lower := strings.ToLower(key)

	if !strings.ContainsAny(key, `*?[\`) {
		if _, dup := t.emails[lower]; dup {
			return fmt.Errorf("prices: %s: another account differs only in case", entry)
		}

		t.ids[key], t.emails[lower] = price, price

		return nil
	}

	if _, err := path.Match(key, ""); err != nil {
		return fmt.Errorf("prices: %s: malformed pattern: %w", entry, err)
	}

	for _, p := range t.patterns {
		if p.lower == lower {
			return fmt.Errorf("prices: %s: another account differs only in case", entry)
		}
	}

	t.patterns = append(t.patterns, pattern{glob: key, lower: lower, price: price})

	return nil
}

func check(entry, key string, price float64) error {
	switch {
	case key == "":
		return fmt.Errorf("prices: %s: empty key", entry)
	case price < 0:
		return fmt.Errorf("prices: %s: price %v is negative", entry, price)
	}

	return nil
}

// Monthly returns what the account costs a month, and false when the table
// does not price it. The first rule that matches wins:
//
//  1. an account key equal to the account's ID;
//  2. an account key equal to its email, ignoring case;
//  3. an account pattern (path.Match) matching its email, ignoring case, then
//     one matching its ID; the longest pattern is tried first, ties in
//     lexical order;
//  4. the price of its plan under its provider, the plan ignoring case;
//  5. the price of its provider.
func (t Table) Monthly(a accounts.Account) (float64, bool) {
	if price, ok := t.ids[a.ID]; ok && a.ID != "" {
		return price, true
	}

	email := strings.ToLower(a.Email)
	if price, ok := t.emails[email]; ok && email != "" {
		return price, true
	}

	if email != "" {
		for _, p := range t.patterns {
			if ok, _ := path.Match(p.lower, email); ok {
				return p.price, true
			}
		}
	}

	if a.ID != "" {
		for _, p := range t.patterns {
			if ok, _ := path.Match(p.glob, a.ID); ok {
				return p.price, true
			}
		}
	}

	if price, ok := t.plans[a.Provider][strings.ToLower(a.Plan)]; ok && a.Plan != "" {
		return price, true
	}

	price, ok := t.providers[a.Provider]

	return price, ok
}

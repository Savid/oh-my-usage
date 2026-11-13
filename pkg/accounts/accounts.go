// Package accounts turns what an omp auth gateway and broker report into the
// accounts the UI shows. It is pure: callers pass the clock in.
package accounts

import (
	"cmp"
	"crypto/sha256"
	"encoding/hex"
	"slices"
	"strconv"
	"strings"
	"time"
)

// PauseScope is the block scope a pause uses. omp checks it for every model
// and never clears it from usage evidence, so a pause survives quota resets.
const PauseScope = "account-policy"

// pausedUntil is the deadline every pause carries. omp sets short
// account-policy blocks of its own; only a block with this deadline is a pause.
var pausedUntil = time.Date(2100, time.January, 1, 0, 0, 0, 0, time.UTC)

// PausedUntil returns the deadline that marks a block as a pause.
func PausedUntil() time.Time { return pausedUntil }

// Credential kinds, as the broker names them.
const (
	KindOAuth  = "oauth"
	KindAPIKey = "api_key"
)

// Report is one account's usage as the gateway reports it.
type Report struct {
	Provider  string
	FetchedAt time.Time
	Email     string
	AccountID string
	OrgID     string
	OrgName   string
	Plan      string
	Limits    []Limit
	Resets    *Resets
}

// Limit is one usage window of an account.
type Limit struct {
	ID          string
	Label       string
	WindowLabel string
	// UsedFraction is 0..1, above 1 for overage; nil when the provider did not
	// report an amount.
	UsedFraction *float64
	Status       string
	// ResetsAt is zero when the provider gave no reset time.
	ResetsAt time.Time
	// Window is how long the window lasts; zero when the provider did not say.
	Window time.Duration
}

// Resets counts an account's saved limit resets.
type Resets struct {
	Available int
	// Usable is how many can be spent now; nil when the provider does not say.
	Usable *int
	// SoonestExpiresAt is zero when no saved reset has an expiry.
	SoonestExpiresAt time.Time
	// Saved lists the resets the provider described; it may be shorter than
	// Available.
	Saved []SavedReset
}

// SavedReset is one limit reset an account holds and has not spent.
type SavedReset struct {
	// Title is the provider's name for it; empty when it gave none.
	Title string
	// Usable is whether it can be spent now; nil when the provider does not say.
	Usable *bool
	// Clears lists the IDs of the limits spending it would reset.
	Clears []string
	// ExpiresAt is zero when it does not expire.
	ExpiresAt time.Time
}

// Credential is one stored login or API key in the broker, without secrets.
type Credential struct {
	ID        int64
	Provider  string
	Kind      string
	Email     string
	AccountID string
	OrgID     string
	OrgName   string
	Blocks    []Block
}

// Block stops a credential from being picked until a deadline.
type Block struct {
	Scope string
	Until time.Time
}

// Paused reports whether the credential carries a pause.
func (c Credential) Paused(now time.Time) bool {
	paused, _ := blockState(c.Blocks, now)

	return paused
}

// Account is one login or API key with its usage.
type Account struct {
	// ID is stable across restarts and does not change when a broker is added.
	ID       string
	Provider string
	// Kind is empty when no broker credential is known for the account.
	Kind    string
	Email   string
	OrgName string
	Plan    string
	// CredentialID is the broker's row ID; zero when unknown.
	CredentialID int64
	Paused       bool
	// BlockedUntil is when omp's own longest block ends; zero when none.
	BlockedUntil time.Time
	// Blocks are omp's own live blocks, the one that ends last first. A pause
	// is not among them.
	Blocks []Block
	Limits []Limit
	Resets *Resets
	// FetchedAt is when the provider reported the usage; zero without a report.
	FetchedAt time.Time
}

// Pausable reports whether the account has a broker credential to block.
func (a Account) Pausable() bool { return a.CredentialID != 0 }

// ProviderKey is the key the broker files the account's blocks under.
func (a Account) ProviderKey() string { return a.Provider + ":" + a.Kind }

// Amount is how a provider states a limit's usage; any field may be missing.
type Amount struct {
	Used              *float64
	Limit             *float64
	UsedFraction      *float64
	RemainingFraction *float64
	Unit              string
}

// Resolve returns the used share of a limit the way omp's own usage views
// work it out: explicit fraction, used/limit, percent used, inverted remaining.
func (a Amount) Resolve() *float64 {
	switch {
	case a.UsedFraction != nil:
		return a.UsedFraction
	case a.Used != nil && a.Limit != nil && *a.Limit > 0:
		v := *a.Used / *a.Limit

		return &v
	case a.Unit == "percent" && a.Used != nil:
		v := *a.Used / 100

		return &v
	case a.RemainingFraction != nil:
		v := max(0, 1-*a.RemainingFraction)

		return &v
	}

	return nil
}

// Merge joins usage reports with broker credentials. Every credential and
// every report appears once: a report joins the credential with the same
// identity, and what has no partner stands alone. credentials is empty when no
// broker is configured.
func Merge(reports []Report, credentials []Credential, now time.Time) []Account {
	out := make([]Account, 0, max(len(reports), len(credentials)))
	used := make([]bool, len(reports))
	ids := make(map[string]bool, cap(out))

	for _, c := range credentials {
		a := Account{
			Provider:     c.Provider,
			Kind:         c.Kind,
			Email:        c.Email,
			OrgName:      c.OrgName,
			CredentialID: c.ID,
		}
		a.Paused, a.Blocks = blockState(c.Blocks, now)
		if len(a.Blocks) > 0 {
			a.BlockedUntil = a.Blocks[0].Until
		}

		identity := identityOf(c.Email, c.OrgID, c.AccountID)

		if i := matchReport(reports, used, c); i >= 0 {
			used[i] = true
			a.applyReport(reports[i])
			identity = identityOf(reports[i].Email, reports[i].OrgID, reports[i].AccountID)
		} else if identity == "" {
			identity = "cred:" + strconv.FormatInt(c.ID, 10)
		}

		a.ID = uniqueID(ids, c.Provider, identity, c.ID)
		out = append(out, a)
	}

	for i, r := range reports {
		if used[i] {
			continue
		}

		a := Account{Provider: r.Provider}
		a.applyReport(r)
		a.ID = uniqueID(ids, r.Provider, identityOf(r.Email, r.OrgID, r.AccountID), 0)
		out = append(out, a)
	}

	slices.SortStableFunc(out, func(x, y Account) int {
		return cmp.Or(cmp.Compare(x.Provider, y.Provider), cmp.Compare(x.Email, y.Email), cmp.Compare(x.ID, y.ID))
	})

	return out
}

func (a *Account) applyReport(r Report) {
	a.Email = cmp.Or(r.Email, a.Email)
	a.OrgName = cmp.Or(r.OrgName, a.OrgName)
	a.Plan = r.Plan

	// Codex reports the plan as the organisation's name too.
	if a.OrgName == a.Plan {
		a.OrgName = ""
	}

	a.Limits = r.Limits
	a.Resets = r.Resets
	a.FetchedAt = r.FetchedAt
}

// blockState splits a credential's live blocks into the pause and omp's
// own, the one that ends last first.
func blockState(blocks []Block, now time.Time) (paused bool, own []Block) {
	for _, b := range blocks {
		if !b.Until.After(now) {
			continue
		}

		if b.Scope == PauseScope && !b.Until.Before(pausedUntil) {
			paused = true

			continue
		}

		own = append(own, b)
	}

	slices.SortStableFunc(own, func(x, y Block) int { return y.Until.Compare(x.Until) })

	return paused, own
}

// matchReport finds the unused report for a credential: same provider and
// same identity. A credential without an identity (an API key) takes the
// provider's first report that has none either.
func matchReport(reports []Report, used []bool, c Credential) int {
	for i, r := range reports {
		if used[i] || r.Provider != c.Provider {
			continue
		}

		if sameIdentity(c, r) {
			return i
		}
	}

	return -1
}

func sameIdentity(c Credential, r Report) bool {
	switch {
	case c.Email != "" && r.Email != "":
		if !strings.EqualFold(c.Email, r.Email) {
			return false
		}

		return c.OrgID == "" || r.OrgID == "" || c.OrgID == r.OrgID
	case c.AccountID != "" && r.AccountID != "":
		return c.AccountID == r.AccountID
	}

	return c.Email == "" && c.AccountID == "" && r.Email == "" && r.AccountID == ""
}

func identityOf(email, orgID, accountID string) string {
	switch {
	case email != "":
		return "email:" + strings.ToLower(email) + "|org:" + orgID
	case accountID != "":
		return "account:" + accountID
	}

	return ""
}

// uniqueID hashes provider and identity into an opaque ID. Two accounts that
// would share one (two API keys of a provider) fall back to the credential.
func uniqueID(seen map[string]bool, provider, identity string, credentialID int64) string {
	id := hashID(provider, identity)
	for n := 0; seen[id]; n++ {
		id = hashID(provider, identity+"#"+strconv.FormatInt(credentialID, 10)+"/"+strconv.Itoa(n))
	}

	seen[id] = true

	return id
}

func hashID(provider, identity string) string {
	sum := sha256.Sum256([]byte(provider + "\x00" + identity))

	return hex.EncodeToString(sum[:8])
}

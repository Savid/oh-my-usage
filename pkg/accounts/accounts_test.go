package accounts_test

import (
	"testing"
	"time"

	"github.com/savid/oh-my-usage/pkg/accounts"
)

var now = time.Date(2026, time.November, 13, 9, 0, 0, 0, time.UTC)

func TestAmountResolve(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		amount accounts.Amount
		want   *float64
	}{
		{"explicit fraction wins", accounts.Amount{UsedFraction: new(0.76), Used: new(10.0), Limit: new(100.0)}, new(0.76)},
		{"used over limit", accounts.Amount{Used: new(30.0), Limit: new(120.0)}, new(0.25)},
		{"zero limit is not a ratio", accounts.Amount{Used: new(30.0), Limit: new(0.0), Unit: "tokens"}, nil},
		{"percent used", accounts.Amount{Used: new(27.0), Unit: "percent"}, new(0.27)},
		{"inverted remaining", accounts.Amount{RemainingFraction: new(0.4)}, new(0.6)},
		{"remaining above one clamps", accounts.Amount{RemainingFraction: new(1.5)}, new(0.0)},
		{"nothing reported", accounts.Amount{Unit: "tokens"}, nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := tc.amount.Resolve()
			if (got == nil) != (tc.want == nil) {
				t.Fatalf("Resolve() = %v, want %v", got, tc.want)
			}

			if got != nil && *got != *tc.want {
				t.Fatalf("Resolve() = %v, want %v", *got, *tc.want)
			}
		})
	}
}

func reports() []accounts.Report {
	return []accounts.Report{
		{
			Provider: "anthropic", FetchedAt: now.Add(-time.Minute),
			Email: "one@example.com", AccountID: "acct-1", OrgID: "org-1", OrgName: "One Org",
			Limits: []accounts.Limit{{ID: "anthropic:7d", Label: "Claude 7 Day", UsedFraction: new(0.76)}},
			Resets: &accounts.Resets{Available: 2, Usable: new(1)},
		},
		{
			Provider: "anthropic", FetchedAt: now.Add(-2 * time.Minute),
			Email: "two@example.com", AccountID: "acct-2", OrgID: "org-2", OrgName: "Two Org",
		},
		{Provider: "openai-codex", Email: "codex@example.com", AccountID: "ws-1", OrgID: "ws-1", Plan: "pro"},
		{Provider: "opencode-go", Plan: "OpenCode Go"},
	}
}

func credentials() []accounts.Credential {
	return []accounts.Credential{
		{ID: 1, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "one@example.com", AccountID: "acct-1", OrgID: "org-1"},
		{
			ID: 6, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "Two@Example.com", AccountID: "acct-2", OrgID: "org-2",
			Blocks: []accounts.Block{{Scope: accounts.PauseScope, Until: accounts.PausedUntil()}},
		},
		{ID: 2, Provider: "openai-codex", Kind: accounts.KindOAuth, Email: "codex@example.com", AccountID: "ws-1", OrgID: "ws-1"},
		{ID: 4, Provider: "openrouter", Kind: accounts.KindAPIKey},
		{ID: 5, Provider: "opencode-go", Kind: accounts.KindAPIKey},
	}
}

func byProviderEmail(t *testing.T, list []accounts.Account, provider, email string) accounts.Account {
	t.Helper()

	for _, a := range list {
		if a.Provider == provider && a.Email == email {
			return a
		}
	}

	t.Fatalf("no %s account %q in %+v", provider, email, list)

	return accounts.Account{}
}

func TestMergeWithoutBroker(t *testing.T) {
	t.Parallel()

	got := accounts.Merge(reports(), nil, now)
	if len(got) != 4 {
		t.Fatalf("got %d accounts, want 4", len(got))
	}

	one := byProviderEmail(t, got, "anthropic", "one@example.com")
	if one.Pausable() || one.Paused || one.Kind != "" {
		t.Errorf("account without a broker credential must not be pausable: %+v", one)
	}

	if one.OrgName != "One Org" || len(one.Limits) != 1 || one.Resets == nil || one.FetchedAt.IsZero() {
		t.Errorf("report fields not carried: %+v", one)
	}
}

func TestMergeJoinsCredentials(t *testing.T) {
	t.Parallel()

	got := accounts.Merge(reports(), credentials(), now)
	if len(got) != 5 {
		t.Fatalf("got %d accounts, want 5 (every credential once): %+v", len(got), got)
	}

	one := byProviderEmail(t, got, "anthropic", "one@example.com")
	if one.CredentialID != 1 || one.Paused || one.ProviderKey() != "anthropic:oauth" {
		t.Errorf("first seat: %+v", one)
	}

	two := byProviderEmail(t, got, "anthropic", "two@example.com")
	if two.CredentialID != 6 || !two.Paused || !two.BlockedUntil.IsZero() {
		t.Errorf("second seat should be paused and matched case-insensitively: %+v", two)
	}

	key := byProviderEmail(t, got, "opencode-go", "")
	if key.CredentialID != 5 || key.Plan != "OpenCode Go" || key.ProviderKey() != "opencode-go:api_key" {
		t.Errorf("API key should join the provider's unnamed report: %+v", key)
	}

	bare := byProviderEmail(t, got, "openrouter", "")
	if bare.CredentialID != 4 || len(bare.Limits) != 0 || !bare.FetchedAt.IsZero() {
		t.Errorf("credential without a report stands alone: %+v", bare)
	}
}

func TestMergeIDsAreStableAndUnique(t *testing.T) {
	t.Parallel()

	without := accounts.Merge(reports(), nil, now)
	with := accounts.Merge(reports(), credentials(), now)

	for _, a := range without {
		b := byProviderEmail(t, with, a.Provider, a.Email)
		if a.ID != b.ID {
			t.Errorf("%s %q: ID changed when a broker was added: %s vs %s", a.Provider, a.Email, a.ID, b.ID)
		}
	}

	seen := map[string]bool{}
	for _, a := range with {
		if len(a.ID) != 16 {
			t.Errorf("ID %q: want 16 hex characters", a.ID)
		}

		if seen[a.ID] {
			t.Errorf("duplicate ID %s", a.ID)
		}

		seen[a.ID] = true
	}

	twoKeys := accounts.Merge(nil, []accounts.Credential{
		{ID: 7, Provider: "openrouter", Kind: accounts.KindAPIKey},
		{ID: 8, Provider: "openrouter", Kind: accounts.KindAPIKey},
	}, now)
	if len(twoKeys) != 2 || twoKeys[0].ID == twoKeys[1].ID {
		t.Errorf("two API keys of one provider need distinct IDs: %+v", twoKeys)
	}
}

func TestMergeBlocks(t *testing.T) {
	t.Parallel()

	limit := now.Add(3 * time.Hour)
	tests := []struct {
		name        string
		blocks      []accounts.Block
		wantPaused  bool
		wantBlocked time.Time
	}{
		{"none", nil, false, time.Time{}},
		{"omp rate limit", []accounts.Block{{Scope: "", Until: limit}}, false, limit},
		{"expired block is ignored", []accounts.Block{{Scope: "", Until: now.Add(-time.Second)}}, false, time.Time{}},
		{"omp's own short policy block is not a pause", []accounts.Block{{Scope: accounts.PauseScope, Until: limit}}, false, limit},
		{
			"pause beside a rate limit",
			[]accounts.Block{{Scope: accounts.PauseScope, Until: accounts.PausedUntil()}, {Scope: "tier:fable", Until: limit}},
			true, limit,
		},
		{
			"longest omp block wins",
			[]accounts.Block{{Scope: "", Until: limit}, {Scope: "auth", Until: limit.Add(time.Hour)}},
			false, limit.Add(time.Hour),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := accounts.Merge(nil, []accounts.Credential{{ID: 1, Provider: "anthropic", Kind: accounts.KindOAuth, Blocks: tc.blocks}}, now)
			if got[0].Paused != tc.wantPaused || !got[0].BlockedUntil.Equal(tc.wantBlocked) {
				t.Errorf("paused=%v blockedUntil=%v, want %v %v", got[0].Paused, got[0].BlockedUntil, tc.wantPaused, tc.wantBlocked)
			}
		})
	}
}

func TestMergeKeepsSameEmailInDifferentOrgsApart(t *testing.T) {
	t.Parallel()

	got := accounts.Merge(
		[]accounts.Report{
			{Provider: "anthropic", Email: "a@example.com", OrgID: "org-1", OrgName: "First"},
			{Provider: "anthropic", Email: "a@example.com", OrgID: "org-2", OrgName: "Second"},
		},
		[]accounts.Credential{
			{ID: 2, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "a@example.com", OrgID: "org-2"},
			{ID: 1, Provider: "anthropic", Kind: accounts.KindOAuth, Email: "a@example.com", OrgID: "org-1"},
		},
		now,
	)
	if len(got) != 2 {
		t.Fatalf("got %d accounts, want 2", len(got))
	}

	for _, a := range got {
		want := map[int64]string{1: "First", 2: "Second"}[a.CredentialID]
		if a.OrgName != want {
			t.Errorf("credential %d joined org %q, want %q", a.CredentialID, a.OrgName, want)
		}
	}
}

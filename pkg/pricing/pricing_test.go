package pricing_test

import (
	"strings"
	"testing"

	"github.com/savid/oh-my-usage/pkg/accounts"
	"github.com/savid/oh-my-usage/pkg/pricing"
)

const example = `{
  "providers": {"anthropic": 200, "openai-codex": 200, "free": 0},
  "plans": {
    "openai-codex": {"pro": 200, "Plus": 20},
    "xai-oauth": {"SuperGrok Monthly Included": 30}
  },
  "accounts": {
    "3f6c2a9d41b07e58": 100,
    "Claude-AR25@ethereum.org": 50,
    "claude-*@ethereum.org": 45,
    "claude-a*@ethereum.org": 40,
    "claude-b*@ethereum.org": 41,
    "*@ethereum.org": 35,
    "00000000000000a?": 10
  }
}`

func TestMonthly(t *testing.T) {
	t.Parallel()

	table, err := pricing.Parse([]byte(example))
	if err != nil {
		t.Fatal(err)
	}

	for name, tc := range map[string]struct {
		account accounts.Account
		want    float64
		priced  bool
	}{
		"exact id beats everything": {
			account: accounts.Account{ID: "3f6c2a9d41b07e58", Email: "claude-ar25@ethereum.org", Provider: "anthropic"},
			want:    100, priced: true,
		},
		"exact email ignores case and beats patterns": {
			account: accounts.Account{ID: "ffff", Email: "claude-ar25@Ethereum.org", Provider: "anthropic"},
			want:    50, priced: true,
		},
		"the longest matching pattern wins": {
			account: accounts.Account{ID: "ffff", Email: "claude-ax@ethereum.org", Provider: "anthropic"},
			want:    40, priced: true,
		},
		"a pattern matches an email ignoring case": {
			account: accounts.Account{ID: "ffff", Email: "CLAUDE-B9@ETHEREUM.ORG", Provider: "anthropic"},
			want:    41, priced: true,
		},
		"a shorter pattern when no longer one matches": {
			account: accounts.Account{ID: "ffff", Email: "claude-zz@ethereum.org", Provider: "anthropic"},
			want:    45, priced: true,
		},
		"the shortest pattern last": {
			account: accounts.Account{ID: "ffff", Email: "codex@ethereum.org", Provider: "openai-codex", Plan: "plus"},
			want:    35, priced: true,
		},
		"an email pattern beats an id pattern": {
			account: accounts.Account{ID: "00000000000000a1", Email: "x@ethereum.org", Provider: "anthropic"},
			want:    35, priced: true,
		},
		"a pattern matches the id": {
			account: accounts.Account{ID: "00000000000000a1", Email: "x@example.com", Provider: "anthropic"},
			want:    10, priced: true,
		},
		"a pattern matches the id without an email": {
			account: accounts.Account{ID: "00000000000000a2", Provider: "opencode-go"},
			want:    10, priced: true,
		},
		"plan ignores case": {
			account: accounts.Account{ID: "ffff", Email: "x@example.com", Provider: "openai-codex", Plan: "PLUS"},
			want:    20, priced: true,
		},
		"plan with spaces": {
			account: accounts.Account{ID: "ffff", Provider: "xai-oauth", Plan: "supergrok monthly included"},
			want:    30, priced: true,
		},
		"unknown plan falls back to the provider": {
			account: accounts.Account{ID: "ffff", Provider: "openai-codex", Plan: "team"},
			want:    200, priced: true,
		},
		"provider without a plan": {
			account: accounts.Account{ID: "ffff", Provider: "anthropic", Plan: "max"},
			want:    200, priced: true,
		},
		"a zero price is a price": {
			account: accounts.Account{ID: "ffff", Provider: "free"},
			want:    0, priced: true,
		},
		"plan of another provider does not apply": {
			account: accounts.Account{ID: "ffff", Provider: "xai-oauth", Plan: "pro"},
		},
		"nothing matches": {
			account: accounts.Account{ID: "ffff", Email: "x@example.com", Provider: "opencode-go"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got, priced := table.Monthly(tc.account)
			if got != tc.want || priced != tc.priced {
				t.Errorf("Monthly(%+v) = %v %v, want %v %v", tc.account, got, priced, tc.want, tc.priced)
			}
		})
	}
}

// Patterns of the same length are tried in lexical order.
func TestMonthlyTiesInLexicalOrder(t *testing.T) {
	t.Parallel()

	table, err := pricing.Parse([]byte(`{"accounts": {"b*@x.org": 2, "*b@x.org": 1}}`))
	if err != nil {
		t.Fatal(err)
	}

	for range 20 {
		if got, _ := table.Monthly(accounts.Account{ID: "ffff", Email: "bob@x.org"}); got != 1 {
			t.Fatalf("Monthly = %v, want 1 (from *b@x.org)", got)
		}
	}
}

func TestZeroTablePricesNothing(t *testing.T) {
	t.Parallel()

	var table pricing.Table
	if got, priced := table.Monthly(accounts.Account{ID: "a", Email: "a@b", Provider: "anthropic", Plan: "max"}); priced {
		t.Errorf("zero table priced %v", got)
	}

	empty, err := pricing.Parse([]byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}

	if got, priced := empty.Monthly(accounts.Account{ID: "a", Provider: "anthropic"}); priced {
		t.Errorf("empty table priced %v", got)
	}
}

// An account without an email or a plan does not match keys that are empty
// by construction: only "*" would, and it is matched against the ID instead.
func TestMonthlyIgnoresMissingFields(t *testing.T) {
	t.Parallel()

	table, err := pricing.Parse([]byte(`{"accounts": {"?*@*": 5}, "plans": {"anthropic": {"max": 9}}}`))
	if err != nil {
		t.Fatal(err)
	}

	if got, priced := table.Monthly(accounts.Account{ID: "ffff", Provider: "anthropic"}); priced {
		t.Errorf("Monthly = %v, want unpriced", got)
	}
}

func TestParseErrors(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		input   string
		wantErr string
	}{
		"not JSON":             {input: `{`, wantErr: "prices: unexpected EOF"},
		"not an object":        {input: `[]`, wantErr: "prices: "},
		"unknown key":          {input: `{"provider": {}}`, wantErr: `unknown field "provider"`},
		"trailing data":        {input: `{} {}`, wantErr: "after the JSON object"},
		"string price":         {input: `{"providers": {"anthropic": "200"}}`, wantErr: "prices: "},
		"negative provider":    {input: `{"providers": {"anthropic": -1}}`, wantErr: `providers["anthropic"]: price -1 is negative`},
		"empty provider":       {input: `{"providers": {"": 1}}`, wantErr: `providers[""]: empty key`},
		"negative plan":        {input: `{"plans": {"openai-codex": {"pro": -200}}}`, wantErr: `plans["openai-codex"]["pro"]: price -200 is negative`},
		"empty plan":           {input: `{"plans": {"openai-codex": {"": 1}}}`, wantErr: `plans["openai-codex"][""]: empty key`},
		"empty plan provider":  {input: `{"plans": {"": {"pro": 1}}}`, wantErr: `plans[""]: empty provider`},
		"plans differ in case": {input: `{"plans": {"x": {"Pro": 1, "pro": 2}}}`, wantErr: "differs only in case"},
		"negative account":     {input: `{"accounts": {"a@b.org": -0.5}}`, wantErr: `accounts["a@b.org"]: price -0.5 is negative`},
		"empty account":        {input: `{"accounts": {"": 1}}`, wantErr: `accounts[""]: empty key`},
		"malformed pattern":    {input: `{"accounts": {"claude-[@x.org": 1}}`, wantErr: `accounts["claude-[@x.org"]: malformed pattern`},
		"trailing escape":      {input: `{"accounts": {"claude\\": 1}}`, wantErr: "malformed pattern"},
		"accounts differ in case": {
			input: `{"accounts": {"A@b.org": 1, "a@b.org": 2}}`, wantErr: "differs only in case",
		},
		"patterns differ in case": {
			input: `{"accounts": {"*@B.org": 1, "*@b.org": 2}}`, wantErr: "differs only in case",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			_, err := pricing.Parse([]byte(tc.input))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("Parse(%s) = %v, want %q", tc.input, err, tc.wantErr)
			}
		})
	}
}

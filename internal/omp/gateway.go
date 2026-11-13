package omp

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/savid/oh-my-usage/pkg/accounts"
)

// Gateway is an omp auth gateway, reached with its gateway token.
type Gateway struct {
	c *client
}

// NewGateway returns a client for the gateway at baseURL, e.g.
// https://omp.example.com.
func NewGateway(baseURL, token string, httpClient *http.Client) (*Gateway, error) {
	c, err := newClient(baseURL, token, httpClient)
	if err != nil {
		return nil, err
	}

	return &Gateway{c: c}, nil
}

// Version asks the gateway's unauthenticated health check for its version.
func (g *Gateway) Version(ctx context.Context) (string, error) {
	var out struct {
		Version string `json:"version"`
	}

	if err := g.c.do(ctx, http.MethodGet, "/healthz", nil, nil, &out); err != nil {
		return "", err
	}

	return out.Version, nil
}

// Usage reads every account's usage report. The gateway caches for 15 s and
// the broker behind it for about 5 min per account, so polling each minute
// costs the providers nothing extra. The gateway answers an empty list, not an
// error, when its broker is unreachable.
func (g *Gateway) Usage(ctx context.Context) ([]accounts.Report, error) {
	var out struct {
		Reports []usageReport `json:"reports"`
	}

	if err := g.c.do(ctx, http.MethodGet, "/v1/usage", nil, nil, &out); err != nil {
		return nil, err
	}

	reports := make([]accounts.Report, 0, len(out.Reports))
	for _, r := range out.Reports {
		reports = append(reports, r.report())
	}

	return reports, nil
}

// usageReport is omp's UsageReport (packages/ai/src/usage.ts). Epoch fields
// are milliseconds.
type usageReport struct {
	Provider  string       `json:"provider"`
	FetchedAt int64        `json:"fetchedAt"`
	Limits    []usageLimit `json:"limits"`
	// Metadata is open-ended and differs per provider; only string values of
	// known keys are read.
	Metadata     map[string]json.RawMessage `json:"metadata"`
	ResetCredits *resetCredits              `json:"resetCredits"`
}

type usageLimit struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Status string `json:"status"`
	Window *struct {
		Label      string `json:"label"`
		DurationMs int64  `json:"durationMs"`
		ResetsAt   int64  `json:"resetsAt"`
	} `json:"window"`
	Amount struct {
		Used              *float64 `json:"used"`
		Limit             *float64 `json:"limit"`
		UsedFraction      *float64 `json:"usedFraction"`
		RemainingFraction *float64 `json:"remainingFraction"`
		Unit              string   `json:"unit"`
	} `json:"amount"`
}

type resetCredits struct {
	AvailableCount  int  `json:"availableCount"`
	RedeemableCount *int `json:"redeemableCount"`
	Credits         []struct {
		Title     string   `json:"title"`
		Usable    *bool    `json:"usable"`
		Clears    []string `json:"clears"`
		ExpiresAt string   `json:"expiresAt"`
	} `json:"credits"`
}

func (r usageReport) report() accounts.Report {
	out := accounts.Report{
		Provider:  r.Provider,
		FetchedAt: fromMillis(r.FetchedAt),
		Email:     r.meta("email"),
		AccountID: r.meta("accountId"),
		OrgID:     r.meta("orgId"),
		OrgName:   r.meta("orgName"),
		Plan:      r.meta("planType"),
		Limits:    make([]accounts.Limit, 0, len(r.Limits)),
	}

	for _, l := range r.Limits {
		limit := accounts.Limit{
			ID:     l.ID,
			Label:  l.Label,
			Status: l.Status,
			UsedFraction: accounts.Amount{
				Used:              l.Amount.Used,
				Limit:             l.Amount.Limit,
				UsedFraction:      l.Amount.UsedFraction,
				RemainingFraction: l.Amount.RemainingFraction,
				Unit:              l.Amount.Unit,
			}.Resolve(),
		}

		if l.Window != nil {
			limit.WindowLabel = l.Window.Label
			limit.ResetsAt = fromMillis(l.Window.ResetsAt)
			limit.Window = time.Duration(max(0, l.Window.DurationMs)) * time.Millisecond
		}

		out.Limits = append(out.Limits, limit)
	}

	if r.ResetCredits != nil {
		out.Resets = r.ResetCredits.resets()
	}

	return out
}

// meta reads a string metadata value; any other type reads as empty.
func (r usageReport) meta(key string) string {
	var value string
	if raw, ok := r.Metadata[key]; ok {
		_ = json.Unmarshal(raw, &value)
	}

	return value
}

func (c resetCredits) resets() *accounts.Resets {
	out := &accounts.Resets{Available: c.AvailableCount}

	// Some providers say which resets can be spent now, some give a count,
	// some neither: then Usable stays unknown rather than reading as zero.
	var usable *int

	for _, credit := range c.Credits {
		if credit.Usable != nil {
			if usable == nil {
				usable = new(int)
			}

			if *credit.Usable {
				*usable++
			}
		}

		saved := accounts.SavedReset{Title: credit.Title, Usable: credit.Usable, Clears: credit.Clears}

		// A reset with no readable expiry is still listed; it just never
		// counts as the soonest to expire.
		if expires, err := time.Parse(time.RFC3339, credit.ExpiresAt); err == nil {
			saved.ExpiresAt = expires.UTC()

			if out.SoonestExpiresAt.IsZero() || saved.ExpiresAt.Before(out.SoonestExpiresAt) {
				out.SoonestExpiresAt = saved.ExpiresAt
			}
		}

		out.Saved = append(out.Saved, saved)
	}

	// The provider's own count wins over the per-credit flags when it has one.
	out.Usable = usable
	if c.RedeemableCount != nil {
		out.Usable = c.RedeemableCount
	}

	return out
}

// fromMillis converts omp's epoch milliseconds; zero stays the zero time.
func fromMillis(ms int64) time.Time {
	if ms == 0 {
		return time.Time{}
	}

	return time.UnixMilli(ms).UTC()
}

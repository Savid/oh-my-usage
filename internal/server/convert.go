package server

import (
	"time"

	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/monitor"
	"github.com/savid/oh-my-usage/pkg/accounts"
)

// The functions here turn the daemon's types into the API's. Times in the API
// are always UTC: the generated client validates date-time fields with Zod,
// which accepts only the Z suffix, not a local offset.

func accountList(state monitor.State) *rest.AccountList {
	out := &rest.AccountList{
		Accounts: make([]rest.Account, 0, len(state.Accounts)),
		Gateway:  sourceStatus(state.Gateway),
	}

	for _, a := range state.Accounts {
		out.Accounts = append(out.Accounts, account(a))
	}

	if state.GatewayVersion != "" {
		out.GatewayVersion = rest.NewOptString(state.GatewayVersion)
	}

	if state.Broker != nil {
		out.Broker = rest.NewOptSourceStatus(sourceStatus(*state.Broker))
	}

	return out
}

func sourceStatus(s monitor.Source) rest.SourceStatus {
	return rest.SourceStatus{Reachable: s.Reachable, Error: optString(s.Err), UpdatedAt: optTime(s.UpdatedAt)}
}

func account(a accounts.Account) rest.Account {
	out := rest.Account{
		ID:           a.ID,
		Provider:     a.Provider,
		Email:        optString(a.Email),
		OrgName:      optString(a.OrgName),
		Plan:         optString(a.Plan),
		Paused:       a.Paused,
		Pausable:     a.Pausable(),
		BlockedUntil: optTime(a.BlockedUntil),
		Blocks:       make([]rest.Block, 0, len(a.Blocks)),
		Limits:       make([]rest.Limit, 0, len(a.Limits)),
		FetchedAt:    optTime(a.FetchedAt),
	}

	switch a.Kind {
	case accounts.KindOAuth:
		out.Kind = rest.NewOptAccountKind(rest.AccountKindOAuth)
	case accounts.KindAPIKey:
		out.Kind = rest.NewOptAccountKind(rest.AccountKindAPIKey)
	}

	for _, b := range a.Blocks {
		out.Blocks = append(out.Blocks, rest.Block{Scope: b.Scope, Until: b.Until.UTC()})
	}

	for _, l := range a.Limits {
		out.Limits = append(out.Limits, limit(l))
	}

	if a.Resets != nil {
		out.Resets = rest.NewOptResets(resets(*a.Resets))
	}

	return out
}

func resets(r accounts.Resets) rest.Resets {
	out := rest.Resets{
		Available:        max(0, r.Available),
		SoonestExpiresAt: optTime(r.SoonestExpiresAt),
	}

	if r.Usable != nil {
		out.Usable = rest.NewOptInt(max(0, *r.Usable))
	}

	for _, saved := range r.Saved {
		entry := rest.SavedReset{
			Title:     optString(saved.Title),
			Clears:    append([]string{}, saved.Clears...),
			ExpiresAt: optTime(saved.ExpiresAt),
		}
		if saved.Usable != nil {
			entry.Usable = rest.NewOptBool(*saved.Usable)
		}

		out.Saved = append(out.Saved, entry)
	}

	return out
}

func limit(l accounts.Limit) rest.Limit {
	out := rest.Limit{
		ID:          l.ID,
		Label:       l.Label,
		WindowLabel: optString(l.WindowLabel),
		ResetsAt:    optTime(l.ResetsAt),
	}

	if l.UsedFraction != nil {
		out.UsedFraction = rest.NewOptFloat64(max(0, *l.UsedFraction))
	}

	if seconds := int(l.Window / time.Second); seconds > 0 {
		out.WindowSeconds = rest.NewOptInt(seconds)
	}

	// A status omp adds later is left out rather than failing the response.
	status := rest.LimitStatus(l.Status)
	if _, err := status.MarshalText(); err == nil {
		out.Status = rest.NewOptLimitStatus(status)
	}

	return out
}

func optString(v string) rest.OptString {
	if v == "" {
		return rest.OptString{}
	}

	return rest.NewOptString(v)
}

func optTime(v time.Time) rest.OptDateTime {
	if v.IsZero() {
		return rest.OptDateTime{}
	}

	return rest.NewOptDateTime(v.UTC())
}

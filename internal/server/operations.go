package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/monitor"
)

// defaultHistory is how far back getAccountHistory reads without `since`.
const defaultHistory = 7 * 24 * time.Hour

// operations implements the ogen-generated operations. Adding an operation
// to api/openapi.yaml and running `make generate` fails the build until its
// method is added here.
type operations struct {
	log          *slog.Logger
	name         string
	version      string
	pollInterval time.Duration
	now          func() time.Time
	monitor      Monitor
	history      History
}

var _ rest.Handler = (*operations)(nil)

// config is the public configuration: served by GetConfig and injected into
// index.html. Nothing here may be a secret.
func (a *operations) config() *rest.Config {
	return &rest.Config{
		Name:                a.name,
		Version:             a.version,
		Controls:            a.monitor.Controls(),
		PollIntervalSeconds: max(1, int(a.pollInterval/time.Second)),
	}
}

func (a *operations) GetConfig(context.Context) (*rest.Config, error) {
	return a.config(), nil
}

// accounts is the latest account list: served by ListAccounts and sent on
// the event stream.
func (a *operations) accounts() *rest.AccountList {
	return accountList(a.monitor.State())
}

func (a *operations) ListAccounts(context.Context) (*rest.AccountList, error) {
	return a.accounts(), nil
}

func (a *operations) SetAccountPaused(
	ctx context.Context, req *rest.PauseRequest, params rest.SetAccountPausedParams,
) (*rest.Account, error) {
	updated, err := a.monitor.SetPaused(ctx, params.AccountId, req.Paused)

	switch {
	case err == nil:
		out := account(updated)

		return &out, nil
	case errors.Is(err, monitor.ErrUnknownAccount):
		return nil, problem(http.StatusNotFound, "no such account")
	case errors.Is(err, monitor.ErrNoBroker):
		return nil, problem(http.StatusConflict, "no broker is configured, so accounts cannot be paused")
	case errors.Is(err, monitor.ErrNotPausable):
		return nil, problem(http.StatusConflict, "the account has no broker credential to pause")
	}

	// What is left is the broker refusing or failing. Its errors name a path
	// and a status, never a credential.
	a.log.WarnContext(ctx, "pause failed", "account", params.AccountId, "paused", req.Paused, "error", err)

	return nil, problem(http.StatusBadGateway, err.Error())
}

func (a *operations) GetAccountHistory(
	ctx context.Context, params rest.GetAccountHistoryParams,
) (*rest.UsageHistory, error) {
	since := a.now().Add(-defaultHistory)
	if v, ok := params.Since.Get(); ok {
		since = v
	}

	samples, err := a.history.History(ctx, params.AccountId, since)
	if err != nil {
		return nil, err
	}

	out := &rest.UsageHistory{Samples: make([]rest.UsageSample, 0, len(samples))}

	for _, s := range samples {
		sample := rest.UsageSample{At: s.At.UTC(), LimitId: s.LimitID, Label: s.Label, UsedFraction: s.UsedFraction}
		if !s.ResetsAt.IsZero() {
			sample.ResetsAt = rest.NewOptDateTime(s.ResetsAt.UTC())
		}

		out.Samples = append(out.Samples, sample)
	}

	return out, nil
}

// NewError turns an unexpected handler error into a 500 problem.
func (a *operations) NewError(ctx context.Context, err error) *rest.ProblemStatusCode {
	a.log.ErrorContext(ctx, "api handler failed", "error", err)

	return problem(http.StatusInternalServerError, "")
}

func problem(status int, detail string) *rest.ProblemStatusCode {
	p := rest.Problem{Title: http.StatusText(status), Status: status}
	if detail != "" {
		p.Detail = rest.NewOptString(detail)
	}

	return &rest.ProblemStatusCode{StatusCode: status, Response: p}
}

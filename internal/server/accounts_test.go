package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/monitor"
)

func TestListAccounts(t *testing.T) {
	t.Parallel()

	rec := get(t, newTestServer(t).Handler(), http.MethodGet, "/api/v1/accounts")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/accounts = %d %s", rec.Code, rec.Body.String())
	}

	var list rest.AccountList
	if err := list.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatal(err)
	}

	if !list.Gateway.Reachable || list.GatewayVersion.Value != "18.19.0" || list.Gateway.Error.Set {
		t.Errorf("gateway = %+v version %+v", list.Gateway, list.GatewayVersion)
	}

	if broker := list.Broker.Value; !list.Broker.Set || broker.Reachable || broker.Error.Value != "connection refused" {
		t.Errorf("broker = %+v", list.Broker)
	}

	checkSeat(t, list.Accounts[0])

	stray := list.Accounts[1]
	if stray.Pausable || stray.Kind.Set || stray.Email.Set || stray.Resets.Set || stray.FetchedAt.Set || stray.Limits == nil {
		t.Errorf("stray = %+v", stray)
	}

	// testNow is in a local zone; the generated web client accepts only UTC.
	for _, want := range []string{
		`"fetchedAt":"2026-09-26T11:59:00Z"`, `"resetsAt":"2026-09-27T09:00:00Z"`,
		`"blockedUntil":"2026-09-26T13:00:00Z"`, `"updatedAt":"2026-09-26T12:00:00Z"`, `"limits":[]`,
	} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("body lacks %s: %s", want, rec.Body.String())
		}
	}
}

// checkSeat checks the account that has every optional field set.
func checkSeat(t *testing.T, seat rest.Account) {
	t.Helper()

	if seat.ID != seatID || seat.Kind.Value != rest.AccountKindOAuth || seat.Email.Value != "one@example.com" ||
		seat.Plan.Value != "max" || !seat.Pausable || seat.Paused || !seat.BlockedUntil.Set {
		t.Errorf("seat = %+v", seat)
	}

	week := seat.Limits[0]
	if week.UsedFraction.Value != 0.76 || week.Status.Value != rest.LimitStatusOk || week.WindowLabel.Value != "7 Day" {
		t.Errorf("limit = %+v", week)
	}

	// A limit without an amount, and with a status this build does not know.
	if fiveHour := seat.Limits[1]; fiveHour.UsedFraction.Set || fiveHour.Status.Set || fiveHour.ResetsAt.Set {
		t.Errorf("bare limit = %+v", fiveHour)
	}

	if resets := seat.Resets.Value; resets.Available != 2 || resets.Usable.Value != 1 || !resets.SoonestExpiresAt.Set {
		t.Errorf("resets = %+v", seat.Resets)
	}
}

func TestListAccountsWithoutBroker(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t)
	srv.monitor.state = monitor.State{Gateway: monitor.Source{Err: "dial tcp: connection refused"}}
	srv.monitor.controls = false

	rec := get(t, srv.Handler(), http.MethodGet, "/api/v1/accounts")

	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}

	if _, ok := body["broker"]; ok || string(body["accounts"]) != "[]" {
		t.Errorf("body = %s", rec.Body.String())
	}

	if want := `{"reachable":false,"error":"dial tcp: connection refused"}`; string(body["gateway"]) != want {
		t.Errorf("gateway = %s, want %s", body["gateway"], want)
	}

	var cfg rest.Config
	if err := cfg.UnmarshalJSON(get(t, srv.Handler(), http.MethodGet, "/api/v1/config").Body.Bytes()); err != nil || cfg.Controls {
		t.Errorf("config = %+v, %v; want controls off", cfg, err)
	}
}

func TestSetAccountPaused(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t)
	h := srv.Handler()
	path := "/api/v1/accounts/" + seatID + "/pause"

	for _, paused := range []bool{true, false} {
		body := `{"paused":false}`
		if paused {
			body = `{"paused":true}`
		}

		rec := send(t, h, http.MethodPut, path, body)

		var got rest.Account
		if err := got.UnmarshalJSON(rec.Body.Bytes()); err != nil {
			t.Fatal(err)
		}

		if rec.Code != http.StatusOK || got.ID != seatID || got.Paused != paused {
			t.Errorf("PUT paused=%v = %d %+v", paused, rec.Code, got)
		}

		if srv.monitor.State().Accounts[0].Paused != paused {
			t.Errorf("monitor not asked to set paused=%v", paused)
		}
	}
}

func TestSetAccountPausedProblems(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		id, body string
		pauseErr error
		status   int
		detail   string
	}{
		"unknown account":      {id: "ffffffffffffffff", body: `{"paused":true}`, status: http.StatusNotFound, detail: "no such account"},
		"no broker credential": {id: strayID, body: `{"paused":true}`, status: http.StatusConflict, detail: "no broker credential"},
		"no broker": {
			id: seatID, body: `{"paused":true}`, pauseErr: monitor.ErrNoBroker,
			status: http.StatusConflict, detail: "no broker is configured",
		},
		"broker failed": {
			id: seatID, body: `{"paused":true}`, pauseErr: errBoom,
			status: http.StatusBadGateway, detail: "boom",
		},
		"malformed ID": {id: "not-an-id", body: `{"paused":true}`, status: http.StatusBadRequest},
		"no body":      {id: seatID, body: ``, status: http.StatusBadRequest},
		"wrong type":   {id: seatID, body: `{"paused":"yes"}`, status: http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			srv := newTestServer(t)
			srv.monitor.pauseErr = tc.pauseErr

			rec := send(t, srv.Handler(), http.MethodPut, "/api/v1/accounts/"+tc.id+"/pause", tc.body)

			var p rest.Problem
			if err := p.UnmarshalJSON(rec.Body.Bytes()); err != nil {
				t.Fatalf("%d %s: %v", rec.Code, rec.Body.String(), err)
			}

			if rec.Code != tc.status || p.Status != tc.status || !strings.Contains(p.Detail.Value, tc.detail) {
				t.Errorf("= %d %+v, want %d %q", rec.Code, p, tc.status, tc.detail)
			}
		})
	}
}

func TestGetAccountHistory(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t)
	h := srv.Handler()

	rec := get(t, h, http.MethodGet, "/api/v1/accounts/"+seatID+"/history")

	var history rest.UsageHistory
	if err := history.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatalf("%d %s: %v", rec.Code, rec.Body.String(), err)
	}

	if rec.Code != http.StatusOK || len(history.Samples) != 2 {
		t.Fatalf("= %d %+v", rec.Code, history)
	}

	first, second := history.Samples[0], history.Samples[1]
	if first.LimitId != "anthropic:7d" || first.Label != "Claude 7 Day" || first.UsedFraction != 0.7 || !first.ResetsAt.Set {
		t.Errorf("first = %+v", first)
	}

	if second.UsedFraction != 1.2 || second.ResetsAt.Set {
		t.Errorf("second = %+v", second)
	}

	if !strings.Contains(rec.Body.String(), `"at":"2026-09-26T11:00:00Z"`) {
		t.Errorf("sample time is not in UTC: %s", rec.Body.String())
	}

	if want := testNow.Add(-7 * 24 * time.Hour); !srv.history.since.Equal(want) {
		t.Errorf("default since = %v, want %v", srv.history.since, want)
	}

	get(t, h, http.MethodGet, "/api/v1/accounts/"+seatID+"/history?since=2026-09-01T00:00:00Z")

	if want := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC); !srv.history.since.Equal(want) {
		t.Errorf("since = %v, want %v", srv.history.since, want)
	}

	// An account with nothing recorded answers an empty list, not a 404.
	empty := get(t, h, http.MethodGet, "/api/v1/accounts/"+strayID+"/history")
	if empty.Code != http.StatusOK || strings.TrimSpace(empty.Body.String()) != `{"samples":[]}` {
		t.Errorf("empty history = %d %s", empty.Code, empty.Body.String())
	}

	if bad := get(t, h, http.MethodGet, "/api/v1/accounts/"+seatID+"/history?since=yesterday"); bad.Code != http.StatusBadRequest {
		t.Errorf("bad since = %d", bad.Code)
	}

	srv.history.err = errBoom

	failed := get(t, h, http.MethodGet, "/api/v1/accounts/"+seatID+"/history")
	if failed.Code != http.StatusInternalServerError || strings.Contains(failed.Body.String(), "boom") {
		t.Errorf("store failure = %d %s; want a 500 that hides the cause", failed.Code, failed.Body.String())
	}
}

func TestListUsageTrends(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t)
	h := srv.Handler()

	rec := get(t, h, http.MethodGet, "/api/v1/trends")

	var list rest.UsageTrendList
	if err := list.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatalf("%d %s: %v", rec.Code, rec.Body.String(), err)
	}

	if rec.Code != http.StatusOK || len(list.Trends) != 2 {
		t.Fatalf("= %d %+v", rec.Code, list)
	}

	week := list.Trends[0]
	if week.AccountId != seatID || week.LimitId != "anthropic:7d" || len(week.Points) != 2 || week.Points[1].UsedFraction != 0.76 {
		t.Errorf("trend = %+v", week)
	}

	if !strings.Contains(rec.Body.String(), `"at":"2026-09-26T11:00:00Z"`) {
		t.Errorf("point time is not in UTC: %s", rec.Body.String())
	}

	// Seven days up to now by default, thinned to a fixed number of steps.
	if !srv.history.since.Equal(testNow.Add(-7*24*time.Hour)) || !srv.history.until.Equal(testNow) || srv.history.steps != 60 {
		t.Errorf("read %v to %v in %d steps", srv.history.since, srv.history.until, srv.history.steps)
	}

	get(t, h, http.MethodGet, "/api/v1/trends?since=2026-09-25T12:00:00Z")

	if want := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC); !srv.history.since.Equal(want) {
		t.Errorf("since = %v, want %v", srv.history.since, want)
	}

	srv.history.trends = nil

	empty := get(t, h, http.MethodGet, "/api/v1/trends")
	if empty.Code != http.StatusOK || strings.TrimSpace(empty.Body.String()) != `{"trends":[]}` {
		t.Errorf("no trends = %d %s", empty.Code, empty.Body.String())
	}

	srv.history.err = errBoom

	if failed := get(t, h, http.MethodGet, "/api/v1/trends"); failed.Code != http.StatusInternalServerError {
		t.Errorf("store failure = %d", failed.Code)
	}
}

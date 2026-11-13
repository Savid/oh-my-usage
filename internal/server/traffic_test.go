package server

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/savid/oh-my-usage/api/rest"
)

func getTraffic(t *testing.T, srv *testServer) (rest.Traffic, string) {
	t.Helper()

	rec := get(t, srv.Handler(), http.MethodGet, "/api/v1/traffic")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/traffic = %d %s", rec.Code, rec.Body.String())
	}

	var out rest.Traffic
	if err := out.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatal(err)
	}

	return out, rec.Body.String()
}

func TestGetTraffic(t *testing.T) {
	t.Parallel()

	srv := newTrafficServer(t)
	got, body := getTraffic(t, srv)

	if !got.Available || got.Error.Set {
		t.Errorf("available = %t, error = %+v", got.Available, got.Error)
	}

	// testNow is in a local zone; the generated web client accepts only UTC.
	for _, want := range []string{
		`"updatedAt":"2026-09-26T11:59:52Z"`, `"measuredSince":"2026-09-23T12:00:00Z"`,
		`"start":"2026-09-26T11:01:00Z"`, `"start":"2026-09-19T13:00:00Z"`, `"since":"2026-09-26T11:00:00Z"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %s", want)
		}
	}

	// The last hour and the series by minute leave estimates out; the rest keep them.
	wantAsked := []string{
		"totals 2026-09-26T11:00:00Z measured=true",
		"totals 2026-09-25T12:00:00Z measured=false",
		"totals 2026-09-19T12:00:00Z measured=false",
		"series 2026-09-26T11:01:00Z 1m0s x60 measured=true",
		"series 2026-09-19T13:00:00Z 1h0m0s x168 measured=false",
	}
	if !slices.Equal(srv.traffic.asked, wantAsked) {
		t.Errorf("reads =\n%q\nwant\n%q", srv.traffic.asked, wantAsked)
	}

	checkWindows(t, got)
	checkSeries(t, got)
}

func checkWindows(t *testing.T, got rest.Traffic) {
	t.Helper()

	ids := make([]rest.TrafficWindowID, 0, len(got.Windows))
	for _, w := range got.Windows {
		ids = append(ids, w.ID)
	}

	if !slices.Equal(ids, []rest.TrafficWindowID{rest.TrafficWindowIDHour, rest.TrafficWindowIDDay, rest.TrafficWindowIDWeek}) {
		t.Fatalf("windows = %v", ids)
	}

	// Both clients' Anthropic traffic is one provider, the costliest first.
	week := got.Windows[2]
	if week.Total.Requests != 15 || week.Total.CostUsd != 5.5 || week.Total.CacheWriteTokens != 4000 {
		t.Errorf("week total = %+v", week.Total)
	}

	wantProviders := []rest.TrafficProviderCounts{
		{Provider: "anthropic", Counts: rest.TrafficCounts{
			Requests: 12, InputTokens: 1, OutputTokens: 25, CacheReadTokens: 300, CacheWriteTokens: 4000, CostUsd: 5,
		}},
		{Provider: "openai-codex", Counts: rest.TrafficCounts{Requests: 3, InputTokens: 30, CostUsd: 0.5}},
	}
	if !slices.Equal(week.Providers, wantProviders) {
		t.Errorf("week by provider = %+v, want %+v", week.Providers, wantProviders)
	}

	// The clients are the week's streams, as the record orders them.
	wantLaptop := rest.TrafficClient{
		InstallId: "install-2", Hostname: "laptop", App: "omp", Provider: "anthropic",
		Counts: rest.TrafficCounts{Requests: 2, OutputTokens: 5, CostUsd: 1},
	}
	if len(got.Clients) != 3 || got.Clients[0].Provider != "openai-codex" || got.Clients[2] != wantLaptop {
		t.Errorf("clients = %+v", got.Clients)
	}
}

func checkSeries(t *testing.T, got rest.Traffic) {
	t.Helper()

	minutes := got.Minutes
	if minutes.StepSeconds != 60 || minutes.Steps != 60 || len(minutes.Providers) != 2 {
		t.Fatalf("minutes = %+v", minutes)
	}

	// Codex cost more over the series, so it comes first. Every array has a value per step.
	codex, claude := minutes.Providers[0], minutes.Providers[1]
	if codex.Provider != "openai-codex" || len(codex.CostUsd) != 60 || codex.CostUsd[3] != 5 || codex.CacheReadTokens[3] != 50 {
		t.Errorf("codex by minute = %+v", codex)
	}

	if codex.Requests[3] != 9 || codex.Requests[0] != 0 {
		t.Errorf("codex requests by minute = %v", codex.Requests)
	}

	if claude.Provider != "anthropic" || claude.Requests[0] != 4 || claude.OutputTokens[0] != 100 || len(claude.Requests) != 60 {
		t.Errorf("claude by minute = %+v", claude)
	}

	if claude.CostUsd[59] != 0.25 || claude.InputTokens[59] != 7 || claude.CacheWriteTokens[59] != 0 {
		t.Errorf("claude's last minute = %v, %v", claude.CostUsd[59], claude.InputTokens[59])
	}

	if got.Hours.StepSeconds != 3600 || got.Hours.Steps != 168 || len(got.Hours.Providers[0].OutputTokens) != 168 {
		t.Errorf("hours = %+v", got.Hours)
	}
}

func TestGetTrafficWithoutBroker(t *testing.T) {
	t.Parallel()

	got, body := getTraffic(t, newTestServer(t))

	if got.Available || got.UpdatedAt.Set || got.MeasuredSince.Set || got.Error.Set {
		t.Errorf("traffic without a broker = %+v", got)
	}

	// Empty, and still the shape the web client's schema accepts.
	if got.Minutes.Steps != 60 || got.Hours.Steps != 168 {
		t.Errorf("series = %+v, %+v", got.Minutes, got.Hours)
	}

	for _, want := range []string{`"windows":[]`, `"clients":[]`, `"providers":[]`} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %s: %s", want, body)
		}
	}
}

func TestGetTrafficReportsAFailingBroker(t *testing.T) {
	t.Parallel()

	srv := newTrafficServer(t)
	srv.collector.status.Err = "GET /v1/usage/clients: connection refused"

	got, _ := getTraffic(t, srv)

	// The last traffic stays, with why it is old.
	if got.Error.Value != "GET /v1/usage/clients: connection refused" || !got.UpdatedAt.Set || len(got.Windows) != 3 {
		t.Errorf("traffic = %+v", got)
	}
}

func TestGetTrafficBeforeTheFirstReading(t *testing.T) {
	t.Parallel()

	srv := newTrafficServer(t)
	srv.collector.status = collectorStatusZero
	srv.traffic.since = collectorStatusZero.UpdatedAt
	srv.traffic.totals, srv.traffic.steps = nil, nil

	got, body := getTraffic(t, srv)

	if !got.Available || got.UpdatedAt.Set || got.MeasuredSince.Set || len(got.Windows) != 3 ||
		got.Windows[0].Total.Requests != 0 {
		t.Errorf("traffic = %+v", got)
	}

	if !strings.Contains(body, `"providers":[]`) || !strings.Contains(body, `"clients":[]`) {
		t.Errorf("body = %s", body)
	}
}

func TestGetTrafficFailsWhenTheRecordDoes(t *testing.T) {
	t.Parallel()

	srv := newTrafficServer(t)
	srv.traffic.err = errors.New("database is locked")

	rec := get(t, srv.Handler(), http.MethodGet, "/api/v1/traffic")
	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "locked") {
		t.Errorf("GET /api/v1/traffic = %d %s; want a 500 that does not quote the error", rec.Code, rec.Body.String())
	}
}

// With a broker the stream also sends the traffic: on connect and again
// after every collection.
func TestStreamEventsWithTraffic(t *testing.T) {
	t.Parallel()

	srv := newTrafficServer(t)

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// A collection that finished before the client connected.
	srv.collector.changed <- struct{}{}

	_, events := readEvents(t, ts.URL, 3)

	names := []string{events[0].name, events[1].name, events[2].name}
	if !slices.Equal(names, []string{"accounts", "traffic", "traffic"}) {
		t.Fatalf("events = %v, want accounts, traffic, traffic", names)
	}

	var got rest.Traffic
	if err := got.UnmarshalJSON(events[2].data); err != nil {
		t.Fatal(err)
	}

	if !got.Available || len(got.Windows) != 3 || len(got.Minutes.Providers) != 2 {
		t.Errorf("traffic event = %+v", got)
	}
}

package server

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/collector"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/pkg/traffic"
)

// The streams the traffic fakes know.
var (
	gatewayClaude = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "anthropic"}
	gatewayCodex  = traffic.Key{InstallID: "install-1", App: "gateway", Provider: "openai-codex"}
	laptopClaude  = traffic.Key{InstallID: "install-2", App: "omp", Provider: "anthropic"}
)

var testAssets = fstest.MapFS{"index.html": {Data: []byte("<!doctype html><html><head><title>app</title><!--config--></head></html>")}}

// testNow is in a local zone on purpose: the API must answer in UTC.
var testNow = time.Date(2026, 9, 26, 22, 0, 0, 0, time.FixedZone("AEST", 10*3600))

// testServer is a server over fakes the test can change.
type testServer struct {
	*Server

	monitor *fakeMonitor
	history *fakeHistory
	// collector and traffic are nil in a server without a broker.
	collector *fakeCollector
	traffic   *fakeTraffic
}

// newTestServer is a server with no broker: it has no traffic to serve.
func newTestServer(t *testing.T) *testServer {
	t.Helper()

	return newServer(t, false)
}

// newTrafficServer is a server with a broker whose traffic is being collected.
func newTrafficServer(t *testing.T) *testServer {
	t.Helper()

	return newServer(t, true)
}

func newServer(t *testing.T, broker bool) *testServer {
	t.Helper()

	cfg := Config{
		Listen: "127.0.0.1:0", Name: "app", Version: "test", PollInterval: time.Minute,
		Now: func() time.Time { return testNow },
	}
	ts := &testServer{
		monitor: newFakeMonitor(),
		history: &fakeHistory{samples: []store.Sample{
			{
				AccountID: seatID, LimitID: "anthropic:7d", At: testNow.Add(-time.Hour), Provider: "anthropic",
				Label: "Claude 7 Day", UsedFraction: 0.7, Status: "ok", ResetsAt: testNow.Add(21 * time.Hour),
			},
			{AccountID: seatID, LimitID: "anthropic:5h", At: testNow, Label: "Claude 5 Hour", UsedFraction: 1.2},
		}, trends: []store.Trend{
			{AccountID: seatID, LimitID: "anthropic:7d", Points: []store.TrendPoint{
				{At: testNow.Add(-time.Hour), UsedFraction: 0.7}, {At: testNow, UsedFraction: 0.76},
			}},
			{AccountID: strayID, LimitID: "weekly", Points: []store.TrendPoint{{At: testNow, UsedFraction: 0}}},
		}},
	}

	deps := Deps{Monitor: ts.monitor, History: ts.history}

	if broker {
		ts.collector = &fakeCollector{
			status:  collector.Status{UpdatedAt: testNow.Add(-8 * time.Second)},
			changed: make(chan struct{}, 1),
		}
		ts.traffic = &fakeTraffic{
			since: testNow.Add(-72 * time.Hour),
			totals: []store.TrafficTotal{
				{Key: gatewayCodex, Hostname: "gateway-host", Requests: 3, InputTokens: 30, CostUSD: 0.5},
				{
					Key: gatewayClaude, Hostname: "gateway-host",
					Requests: 10, InputTokens: 1, OutputTokens: 20, CacheReadTokens: 300, CacheWriteTokens: 4000, CostUSD: 4,
				},
				{Key: laptopClaude, Hostname: "laptop", Requests: 2, OutputTokens: 5, CostUSD: 1},
			},
			steps: []store.TrafficStep{
				{Index: 0, Provider: "anthropic", Requests: 4, OutputTokens: 100, CostUSD: 2},
				{Index: 59, Provider: "anthropic", Requests: 1, InputTokens: 7, CostUSD: 0.25},
				{Index: 3, Provider: "openai-codex", Requests: 9, CacheReadTokens: 50, CostUSD: 5},
				// Outside the series: dropped, not a panic.
				{Index: 900, Provider: "anthropic", Requests: 1},
			},
		}
		deps.Collector, deps.Traffic = ts.collector, ts.traffic
	}

	s, err := New(slog.New(slog.DiscardHandler), cfg, testAssets, deps)
	if err != nil {
		t.Fatal(err)
	}

	ts.Server = s

	return ts
}

func get(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	return send(t, h, method, path, "")
}

func send(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body))

	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	h.ServeHTTP(rec, req)

	return rec
}

func TestRoutes(t *testing.T) {
	t.Parallel()

	h := newTestServer(t).Handler()
	for _, tc := range []struct {
		method, path string
		status       int
		contentType  string
	}{
		{http.MethodGet, "/", http.StatusOK, "text/html; charset=utf-8"},
		{http.MethodGet, "/some/client/route", http.StatusOK, "text/html; charset=utf-8"},
		{http.MethodGet, "/openapi.yaml", http.StatusOK, "application/yaml"},
		{http.MethodGet, "/api/v1/missing", http.StatusNotFound, "application/problem+json"},
		{http.MethodPost, "/api/v1/accounts", http.StatusMethodNotAllowed, "application/problem+json"},
	} {
		rec := get(t, h, tc.method, tc.path)
		if rec.Code != tc.status || rec.Header().Get("Content-Type") != tc.contentType {
			t.Errorf("%s %s = %d %q, want %d %q", tc.method, tc.path,
				rec.Code, rec.Header().Get("Content-Type"), tc.status, tc.contentType)
		}
	}
}

// The configuration is served by the API and injected into the page, byte
// for byte the same.
func TestConfigServedAndInjected(t *testing.T) {
	t.Parallel()

	h := newTestServer(t).Handler()

	rec := get(t, h, http.MethodGet, "/api/v1/config")

	var cfg rest.Config
	if err := cfg.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatal(err)
	}

	if rec.Code != http.StatusOK || cfg.Name != "app" || cfg.Version != "test" || !cfg.Controls || cfg.PollIntervalSeconds != 60 {
		t.Fatalf("GET /api/v1/config = %d %+v", rec.Code, cfg)
	}

	page := get(t, h, http.MethodGet, "/some/client/route").Body.String()
	if want := "<script>window.__CONFIG__=" + rec.Body.String() + ";</script>"; !strings.Contains(page, want) {
		t.Fatalf("page %q lacks %q", page, want)
	}
}

// Every response carries a request ID, which a proxy in front may supply.
func TestResponsesCarryRequestID(t *testing.T) {
	t.Parallel()

	rec := get(t, newTestServer(t).Handler(), http.MethodGet, "/api/v1/config")
	if rec.Header().Get(requestIDHeader) == "" {
		t.Error("config response has no request ID")
	}
}

func TestProblemBody(t *testing.T) {
	t.Parallel()

	rec := get(t, newTestServer(t).Handler(), http.MethodGet, "/api/v1/missing")

	var p rest.Problem
	if err := p.UnmarshalJSON(rec.Body.Bytes()); err != nil {
		t.Fatal(err)
	}

	if p.Status != http.StatusNotFound || p.Title != "Not Found" || p.Detail.Value != "no such API route" {
		t.Errorf("problem = %+v", p)
	}
}

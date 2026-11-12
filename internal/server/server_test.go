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
	"github.com/savid/oh-my-usage/internal/store"
)

var testAssets = fstest.MapFS{"index.html": {Data: []byte("<!doctype html><html><head><title>app</title><!--config--></head></html>")}}

// testNow is in a local zone on purpose: the API must answer in UTC.
var testNow = time.Date(2026, 9, 26, 22, 0, 0, 0, time.FixedZone("AEST", 10*3600))

// testServer is a server over fakes the test can change.
type testServer struct {
	*Server

	monitor *fakeMonitor
	history *fakeHistory
}

func newTestServer(t *testing.T) *testServer {
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
		}},
	}

	s, err := New(slog.New(slog.DiscardHandler), cfg, testAssets, Deps{Monitor: ts.monitor, History: ts.history})
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

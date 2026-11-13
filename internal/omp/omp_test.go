package omp_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/internal/omp"
	"github.com/savid/oh-my-usage/pkg/accounts"
	"github.com/savid/oh-my-usage/pkg/traffic"
)

const token = "test-token"

// serve answers each "METHOD /path" with a canned handler and fails the test
// on a request without the bearer token.
func serve(t *testing.T, routes map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" && r.Header.Get("Authorization") != "Bearer "+token {
			t.Errorf("%s %s: Authorization = %q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}

		handler, ok := routes[r.Method+" "+r.URL.Path]
		if !ok {
			http.Error(w, `{"error":"No route"}`, http.StatusNotFound)

			return
		}

		handler(w, r)
	}))
	t.Cleanup(srv.Close)

	return srv
}

func fixture(t *testing.T, name string) http.HandlerFunc {
	t.Helper()

	body, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}

	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}
}

func TestGatewayUsage(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage": fixture(t, "usage.json")})

	gateway, err := omp.NewGateway(srv.URL+"/", token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	reports, err := gateway.Usage(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(reports) != 4 {
		t.Fatalf("got %d reports, want 4", len(reports))
	}

	one := reports[0]
	if one.Provider != "anthropic" || one.Email != "one@example.com" || one.OrgName != "one@example.com's Organization" {
		t.Errorf("identity: %+v", one)
	}

	if one.FetchedAt.IsZero() || one.FetchedAt.Location() != time.UTC {
		t.Errorf("fetchedAt = %v, want a UTC time", one.FetchedAt)
	}

	week := one.Limits[0]
	if week.ID != "anthropic:7d" || week.Label != "Claude 7 Day" || week.WindowLabel != "7 Day" || week.Status != "ok" {
		t.Errorf("limit: %+v", week)
	}

	if week.UsedFraction == nil || *week.UsedFraction != 0.76 || week.ResetsAt.IsZero() || week.Window != 7*24*time.Hour {
		t.Errorf("limit amount: %+v", week)
	}

	if one.Resets == nil || one.Resets.Available != 2 || one.Resets.Usable == nil || *one.Resets.Usable != 1 || one.Resets.SoonestExpiresAt.IsZero() {
		t.Errorf("resets: %+v", one.Resets)
	}

	codex := reports[2]
	// Codex says neither how many resets are usable nor which.
	if codex.Plan != "pro" || codex.Resets == nil || codex.Resets.Available != 1 || codex.Resets.Usable != nil {
		t.Errorf("codex: %+v resets %+v", codex, codex.Resets)
	}

	key := reports[3]
	if key.Email != "" || key.Plan != "OpenCode Go" || key.Resets != nil || len(key.Limits) != 3 {
		t.Errorf("API key report: %+v", key)
	}
}

// Each saved reset is described as far as the provider describes it: what it
// is, what it would clear, whether it can be spent and when it lapses.
func TestGatewayUsageSavedResets(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage": fixture(t, "usage.json")})

	gateway, err := omp.NewGateway(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	reports, err := gateway.Usage(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	saved := reports[0].Resets.Saved
	if len(saved) != 2 {
		t.Fatalf("saved resets: %+v", saved)
	}

	full := saved[0]
	if full.Title != "One full limit reset (November 2026)" || full.Usable == nil || !*full.Usable ||
		!slices.Equal(full.Clears, []string{"anthropic:7d", "anthropic:7d:fable"}) ||
		!full.ExpiresAt.Equal(time.Date(2026, time.December, 10, 22, 0, 0, 0, time.UTC)) {
		t.Errorf("saved reset: %+v", full)
	}

	// Codex gives a reset only its dates.
	bare := reports[2].Resets.Saved
	if len(bare) != 1 || bare[0].Title != "" || bare[0].Usable != nil || len(bare[0].Clears) != 0 || bare[0].ExpiresAt.IsZero() {
		t.Errorf("codex saved resets: %+v", bare)
	}
}

func TestGatewayUsageToleratesOddMetadata(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage": func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"reports":[{"provider":"x","fetchedAt":0,"limits":[
			{"id":"a","label":"A","amount":{"unit":"tokens"}}],
			"metadata":{"email":42,"orgName":{"nested":true},"planType":"team"}}]}`)
	}})

	gateway, err := omp.NewGateway(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	reports, err := gateway.Usage(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	got := reports[0]
	if got.Email != "" || got.OrgName != "" || got.Plan != "team" || !got.FetchedAt.IsZero() {
		t.Errorf("report: %+v", got)
	}

	if got.Limits[0].UsedFraction != nil || !got.Limits[0].ResetsAt.IsZero() {
		t.Errorf("limit without an amount or window: %+v", got.Limits[0])
	}
}

func TestGatewayVersion(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /healthz": func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"ok":true,"version":"18.19.0"}`)
	}})

	gateway, err := omp.NewGateway(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	version, err := gateway.Version(context.Background())
	if err != nil || version != "18.19.0" {
		t.Fatalf("Version() = %q, %v", version, err)
	}
}

func TestStatusError(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage": func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"error":"client tokens cannot read gateway-wide usage or credential health"}`)
	}})

	gateway, err := omp.NewGateway(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	_, err = gateway.Usage(context.Background())

	var status *omp.StatusError
	if !errors.As(err, &status) || status.Status != http.StatusForbidden {
		t.Fatalf("err = %v, want a 403 StatusError", err)
	}

	if !strings.Contains(err.Error(), "client tokens cannot read") || strings.Contains(err.Error(), srv.URL) {
		t.Errorf("error %q: want the detail and no URL", err)
	}
}

func TestTransportErrorHidesURL(t *testing.T) {
	t.Parallel()

	srv := serve(t, nil)
	url := srv.URL
	srv.Close()

	gateway, err := omp.NewGateway(url, token, http.DefaultClient)
	if err != nil {
		t.Fatal(err)
	}

	_, err = gateway.Usage(context.Background())
	if err == nil || strings.Contains(err.Error(), url) {
		t.Fatalf("err = %v, want an error without the URL", err)
	}
}

func TestNewRejectsBadInput(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct{ url, token string }{
		{"", token},
		{"omp.example.com", token},
		{"ftp://omp.example.com", token},
		{"http://omp.example.com", ""},
	} {
		if _, err := omp.NewGateway(tc.url, tc.token, http.DefaultClient); err == nil {
			t.Errorf("NewGateway(%q, %q): no error", tc.url, tc.token)
		}

		if _, err := omp.NewBroker(tc.url, tc.token, http.DefaultClient); err == nil {
			t.Errorf("NewBroker(%q, %q): no error", tc.url, tc.token)
		}
	}
}

func TestBrokerCredentials(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/snapshot": func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("OMP-Auth-Broker-Capabilities"); got != "codex-meter-block-scopes" {
			t.Errorf("capabilities header = %q", got)
		}

		fixture(t, "snapshot.json")(w, r)
	}})

	broker, err := omp.NewBroker(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	credentials, err := broker.Credentials(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(credentials) != 5 {
		t.Fatalf("got %d credentials, want 5", len(credentials))
	}

	seat := credentials[1]
	if seat.ID != 6 || seat.Provider != "anthropic" || seat.Kind != accounts.KindOAuth || seat.Email != "two@example.com" || seat.OrgName != "Two Org" {
		t.Errorf("seat: %+v", seat)
	}

	if len(seat.Blocks) != 2 || seat.Blocks[0].Scope != accounts.PauseScope || !seat.Blocks[0].Until.Equal(accounts.PausedUntil()) {
		t.Errorf("blocks: %+v", seat.Blocks)
	}

	key := credentials[3]
	if key.Kind != accounts.KindAPIKey || key.Email != "" || len(key.Blocks) != 0 {
		t.Errorf("API key: %+v", key)
	}

	// The fixture's snapshot carries an access token or API key on every
	// credential; none may survive decoding.
	if dump := fmt.Sprintf("%+v", credentials); strings.Contains(dump, "SECRET") {
		t.Errorf("a secret survived decoding: %s", dump)
	}
}

func TestBrokerBlocks(t *testing.T) {
	t.Parallel()

	var got []string

	record := func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)

		var compact map[string]any
		if err := json.Unmarshal(body, &compact); err != nil {
			t.Errorf("body %q: %v", body, err)
		}

		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q", r.Header.Get("Content-Type"))
		}

		got = append(got, r.Method+" "+string(body))
		_, _ = io.WriteString(w, `{"ok":true}`)
	}
	srv := serve(t, map[string]http.HandlerFunc{
		"POST /v1/credential/6/block":   record,
		"DELETE /v1/credential/6/block": record,
	})

	broker, err := omp.NewBroker(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err = broker.SetBlock(ctx, 6, "anthropic:oauth", accounts.PauseScope, accounts.PausedUntil()); err != nil {
		t.Fatal(err)
	}

	if err = broker.DeleteBlock(ctx, 6, "anthropic:oauth", accounts.PauseScope); err != nil {
		t.Fatal(err)
	}

	want := []string{
		`POST {"providerKey":"anthropic:oauth","blockScope":"account-policy","blockedUntilMs":4102444800000}`,
		`DELETE {"providerKey":"anthropic:oauth","blockScope":"account-policy"}`,
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("requests:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}

	err = broker.SetBlock(ctx, 99, "anthropic:oauth", accounts.PauseScope, accounts.PausedUntil())

	var status *omp.StatusError
	if !errors.As(err, &status) || status.Status != http.StatusNotFound {
		t.Errorf("unknown credential: err = %v, want a 404 StatusError", err)
	}
}

func TestBrokerClientUsage(t *testing.T) {
	t.Parallel()

	var queries []string

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage/clients": func(w http.ResponseWriter, r *http.Request) {
		queries = append(queries, r.URL.RawQuery)

		fixture(t, "clients.json")(w, r)
	}})

	broker, err := omp.NewBroker(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()

	got, err := broker.ClientUsage(ctx, time.Time{})
	if err != nil {
		t.Fatal(err)
	}

	if _, err = broker.ClientUsage(ctx, time.UnixMilli(1794527527000)); err != nil {
		t.Fatal(err)
	}

	// No moment asks for everything; a moment is sent in milliseconds.
	if len(queries) != 2 || queries[0] != "" || queries[1] != "sinceMs=1794527527000" {
		t.Errorf("queries = %q", queries)
	}

	if !got.GeneratedAt.Equal(time.UnixMilli(1794531127939)) || got.Hostnames["install-1"] != "gateway-host" ||
		got.Hostnames["install-2"] != "laptop" {
		t.Errorf("summary = %+v", got)
	}

	claude := got.Counts[traffic.Key{InstallID: "install-1", App: "gateway", Provider: "anthropic"}]
	want := traffic.Counts{
		Requests: 15744, InputTokens: 33572, OutputTokens: 13962540,
		CacheReadTokens: 3938510231, CacheWriteTokens: 68159614, CostUSD: 1772.41885576,
	}

	if claude != want {
		t.Errorf("gateway to Anthropic = %+v, want %+v", claude, want)
	}

	// One client's two rows for the same application and provider add up.
	laptop := got.Counts[traffic.Key{InstallID: "install-2", App: "omp", Provider: "anthropic"}]
	if len(got.Counts) != 3 || laptop.Requests != 12 || laptop.OutputTokens != 700 || laptop.CostUSD != 1.5 {
		t.Errorf("counts = %+v", got.Counts)
	}
}

func TestBrokerClientUsageFails(t *testing.T) {
	t.Parallel()

	srv := serve(t, map[string]http.HandlerFunc{"GET /v1/usage/clients": func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
	}})

	broker, err := omp.NewBroker(srv.URL, token, srv.Client())
	if err != nil {
		t.Fatal(err)
	}

	_, err = broker.ClientUsage(context.Background(), time.Time{})
	if err == nil || !strings.Contains(err.Error(), "HTTP 401: Unauthorized") {
		t.Errorf("error = %v", err)
	}
}

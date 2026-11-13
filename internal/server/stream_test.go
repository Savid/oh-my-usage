package server

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/savid/oh-my-usage/api/rest"
)

type event struct {
	name string
	data []byte
}

// readEvents reads frames from the stream until n events have arrived.
func readEvents(t *testing.T, base string, n int) (retry string, events []event) {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, base+"/api/v1/stream", nil)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("stream = %d %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}

	lines := bufio.NewScanner(resp.Body)

	var ev event

	for len(events) < n && lines.Scan() {
		line := lines.Text()
		switch {
		case strings.HasPrefix(line, "retry: "):
			retry = strings.TrimPrefix(line, "retry: ")
		case strings.HasPrefix(line, "event: "):
			ev.name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			ev.data = []byte(strings.TrimPrefix(line, "data: "))
		case line == "" && ev.data != nil:
			events = append(events, ev)
			ev = event{}
		}
	}

	if len(events) < n {
		t.Fatalf("stream ended after %d events: %v", len(events), lines.Err())
	}

	return retry, events
}

// The stream sends its retry hint, then the accounts on connect and again
// after every poll.
func TestStreamEvents(t *testing.T) {
	t.Parallel()

	srv := newTestServer(t)

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// A poll that finished before the client connected: the stream owes the
	// client a second event for it.
	srv.monitor.changed <- struct{}{}

	retry, events := readEvents(t, ts.URL, 2)

	if retry != "2000" {
		t.Errorf("retry = %q, want 2000", retry)
	}

	for _, ev := range events {
		if ev.name != "accounts" {
			t.Fatalf("event = %q, want accounts", ev.name)
		}

		var list rest.AccountList
		if err := list.UnmarshalJSON(ev.data); err != nil {
			t.Fatal(err)
		}

		if len(list.Accounts) != 2 || list.Accounts[0].ID != seatID || !list.Gateway.Reachable {
			t.Errorf("accounts = %+v", list)
		}
	}
}

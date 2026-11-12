package server

import (
	"net/http"
	"time"
)

const (
	// streamKeepalive is shorter than common proxy idle timeouts.
	streamKeepalive = 15 * time.Second
	// streamRetry is the reconnect delay sent to clients.
	streamRetry = 2 * time.Second
)

// streamEvents serves streamEvents: an `accounts` event on connect and after
// every poll. Every event is complete, so there is no resume cursor.
func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Subscribe before the first send, so a poll between the two is not missed.
	changed, cancel := s.ops.monitor.Subscribe()
	defer cancel()

	sse, err := startSSE(w, streamRetry)
	if err != nil {
		return
	}

	send := func() bool {
		data, encodeErr := s.ops.accounts().MarshalJSON()
		if encodeErr != nil {
			s.log.ErrorContext(ctx, "encode accounts", "error", encodeErr)

			return false
		}

		return sse.event("accounts", data) == nil
	}

	if !send() {
		return
	}

	keepalive := time.NewTicker(streamKeepalive)
	defer keepalive.Stop()

	for ok := true; ok; {
		select {
		case <-ctx.Done():
			return
		case <-s.shutdown:
			return
		case <-keepalive.C:
			ok = sse.ping() == nil
		case <-changed:
			ok = send()
		}
	}
}

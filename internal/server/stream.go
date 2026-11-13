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
// every poll, and with a broker a `traffic` event on connect and after every
// collection. Every event is complete, so there is no resume cursor.
func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Subscribe before the first send, so a change between the two is not missed.
	changed, cancel := s.ops.monitor.Subscribe()
	defer cancel()

	// A nil channel never receives: without a broker there is no traffic.
	var collected <-chan struct{}

	if s.ops.collector != nil {
		var cancelCollected func()

		collected, cancelCollected = s.ops.collector.Subscribe()
		defer cancelCollected()
	}

	sse, err := startSSE(w, streamRetry)
	if err != nil {
		return
	}

	sendAccounts := func() bool {
		data, encodeErr := s.ops.accounts().MarshalJSON()
		if encodeErr != nil {
			s.log.ErrorContext(ctx, "encode accounts", "error", encodeErr)

			return false
		}

		return sse.event("accounts", data) == nil
	}

	// A traffic event that cannot be built is skipped, not fatal: the
	// accounts still flow, and the next collection tries again.
	sendTraffic := func() bool {
		if s.ops.collector == nil {
			return true
		}

		value, readErr := s.ops.traffic(ctx)
		if readErr != nil {
			s.log.WarnContext(ctx, "read traffic", "error", readErr)

			return true
		}

		data, encodeErr := value.MarshalJSON()
		if encodeErr != nil {
			s.log.ErrorContext(ctx, "encode traffic", "error", encodeErr)

			return true
		}

		return sse.event("traffic", data) == nil
	}

	if !sendAccounts() || !sendTraffic() {
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
			ok = sendAccounts()
		case <-collected:
			ok = sendTraffic()
		}
	}
}

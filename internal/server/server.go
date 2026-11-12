// Package server hosts the HTTP API and the embedded web UI.
package server

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/ogen-go/ogen/ogenerrors"

	"github.com/savid/oh-my-usage/api"
	"github.com/savid/oh-my-usage/api/rest"
	"github.com/savid/oh-my-usage/internal/monitor"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/internal/ui"
	"github.com/savid/oh-my-usage/pkg/accounts"
)

const shutdownTimeout = 5 * time.Second

// Config holds what the server needs to start.
type Config struct {
	// Listen is the TCP address to serve on, e.g. 127.0.0.1:8080.
	Listen string
	// Name is the daemon's display name, reported by getConfig.
	Name string
	// Version is reported by getConfig.
	Version string
	// PollInterval is how often the monitor polls, reported by getConfig.
	PollInterval time.Duration
	// Now returns the current time; nil takes time.Now. Tests set it.
	Now func() time.Time
}

func (c Config) withDefaults() Config {
	if c.Name == "" {
		c.Name = "oh-my-usage"
	}

	if c.Now == nil {
		c.Now = time.Now
	}

	return c
}

// Monitor is what the server reads from and asks of the account monitor.
type Monitor interface {
	// State returns the latest accounts and the health of their sources.
	State() monitor.State
	// Subscribe returns a channel that receives after each poll, and a
	// function that ends the subscription.
	Subscribe() (changed <-chan struct{}, cancel func())
	// SetPaused pauses or resumes an account and returns its new state.
	SetPaused(ctx context.Context, accountID string, paused bool) (accounts.Account, error)
	// Controls reports whether accounts can be paused.
	Controls() bool
}

// History reads recorded usage.
type History interface {
	History(ctx context.Context, accountID string, since time.Time) ([]store.Sample, error)
}

// Deps are the parts of the daemon the server serves.
type Deps struct {
	Monitor Monitor
	History History
}

// Server serves /api/v1, the OpenAPI spec and the web UI on one listener.
type Server struct {
	log      *slog.Logger
	cfg      Config
	ops      *operations
	http     *http.Server
	shutdown chan struct{}
}

// New builds the route table. Hand-routed operations (event streams, which
// ogen cannot generate) are registered next to the ogen server's /api/v1/
// catch-all; ServeMux sends each request to its most specific pattern.
func New(log *slog.Logger, cfg Config, assets fs.FS, deps Deps) (*Server, error) {
	cfg = cfg.withDefaults()
	// Every line the server logs inside a request carries that request's ID.
	log = slog.New(requestIDHandler{log.Handler()})
	s := &Server{log: log, cfg: cfg, shutdown: make(chan struct{})}
	s.ops = &operations{
		log: log, name: cfg.Name, version: cfg.Version, pollInterval: cfg.PollInterval, now: cfg.Now,
		monitor: deps.Monitor, history: deps.History,
	}

	generated, err := rest.NewServer(
		s.ops,
		rest.WithErrorHandler(s.handleError),
		rest.WithNotFound(func(w http.ResponseWriter, _ *http.Request) {
			writeProblem(w, problem(http.StatusNotFound, "no such API route"))
		}),
		rest.WithMethodNotAllowed(func(w http.ResponseWriter, _ *http.Request, allowed string) {
			w.Header().Set("Allow", allowed)
			writeProblem(w, problem(http.StatusMethodNotAllowed, ""))
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("api: %w", err)
	}

	// The page carries the configuration the API also serves, so the UI's
	// first render does not wait for a request.
	app, err := ui.Handler(log, assets, func() ([]byte, error) { return s.ops.config().MarshalJSON() })
	if err != nil {
		return nil, fmt.Errorf("ui: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/stream", s.streamEvents)
	mux.Handle("/api/v1/", generated)
	mux.HandleFunc("GET /openapi.yaml", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		_, _ = w.Write(api.Spec)
	})
	mux.Handle("/", app)

	s.http = &http.Server{
		Handler:           withRequestID(accessLog(log, mux)),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
		// No WriteTimeout: event streams are long-lived and bound each write
		// themselves.
	}
	// Shutdown waits for handlers to return; event streams end on this.
	s.http.RegisterOnShutdown(func() { close(s.shutdown) })

	return s, nil
}

// Handler returns the served handler (the route table behind the access
// log), for tests.
func (s *Server) Handler() http.Handler {
	return s.http.Handler
}

// Run serves until ctx is cancelled, then shuts down gracefully.
func (s *Server) Run(ctx context.Context) error {
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", s.cfg.Listen)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	return s.Serve(ctx, ln)
}

// Serve serves on ln until ctx is cancelled, then shuts down gracefully.
func (s *Server) Serve(ctx context.Context, ln net.Listener) error {
	s.log.InfoContext(ctx, "serving", "addr", "http://"+ln.Addr().String())

	served := make(chan error, 1)
	go func() { served <- s.http.Serve(ln) }()

	select {
	case serveErr := <-served:
		return fmt.Errorf("serve: %w", serveErr)
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownTimeout)
	defer cancel()

	if err := s.http.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}

	if err := <-served; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}

	s.log.InfoContext(ctx, "stopped")

	return nil
}

// handleError answers requests ogen could not decode, as problems.
func (s *Server) handleError(ctx context.Context, w http.ResponseWriter, _ *http.Request, err error) {
	code := ogenerrors.ErrorCode(err)
	if code >= http.StatusInternalServerError {
		s.log.ErrorContext(ctx, "api request failed", "error", err)
		writeProblem(w, problem(code, ""))

		return
	}

	writeProblem(w, problem(code, err.Error()))
}

func writeProblem(w http.ResponseWriter, p *rest.ProblemStatusCode) {
	body, err := p.Response.MarshalJSON()
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.StatusCode)
	_, _ = w.Write(body)
}

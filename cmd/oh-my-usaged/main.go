// Command oh-my-usaged watches an omp auth gateway and serves its accounts
// and their usage as an API and an embedded web UI.
//
//	oh-my-usaged -gateway-url https://omp.example.com [flags]
//	oh-my-usaged -version
//
// Tokens are read from the environment or a file, never from a flag:
// OH_MY_USAGE_GATEWAY_TOKEN and OH_MY_USAGE_BROKER_TOKEN.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/savid/oh-my-usage/internal/collector"
	"github.com/savid/oh-my-usage/internal/monitor"
	"github.com/savid/oh-my-usage/internal/omp"
	"github.com/savid/oh-my-usage/internal/server"
	"github.com/savid/oh-my-usage/internal/store"
	"github.com/savid/oh-my-usage/web"
)

// name is the daemon's display name, shown by the UI.
const name = "oh-my-usage"

// Environment variables. A flag wins over its variable.
const (
	envGatewayURL   = "OH_MY_USAGE_GATEWAY_URL"
	envGatewayToken = "OH_MY_USAGE_GATEWAY_TOKEN" //nolint:gosec // G101: a variable's name, not a credential
	envBrokerURL    = "OH_MY_USAGE_BROKER_URL"
	envBrokerToken  = "OH_MY_USAGE_BROKER_TOKEN" //nolint:gosec // G101: a variable's name, not a credential
	// The listen address and the database have variables so a container image
	// can set them and still take the rest as flags.
	envListen = "OH_MY_USAGE_LISTEN"
	envDB     = "OH_MY_USAGE_DB"
)

const (
	// minPollInterval keeps polls no faster than the gateway's own cache.
	minPollInterval = 30 * time.Second
	// minTrafficInterval keeps the broker from being asked without pause.
	minTrafficInterval = 5 * time.Second
	// requestTimeout bounds one request to the gateway or the broker.
	requestTimeout = 20 * time.Second
)

// version is set at build time: -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(os.Args[1:], os.Getenv, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "oh-my-usaged:", err)
		os.Exit(1)
	}
}

type options struct {
	listen           string
	logFormat        string
	logLevel         slog.Level
	version          bool
	gatewayURL       string
	gatewayTokenFile string
	brokerURL        string
	brokerTokenFile  string
	db               string
	pollInterval     time.Duration
	trafficInterval  time.Duration
	retention        time.Duration
}

// errHelp is returned when -h or -help was given; usage has been printed.
var errHelp = errors.New("help requested")

func parse(args []string, getenv func(string) string, stderr io.Writer) (options, error) {
	o := options{logLevel: slog.LevelInfo}

	fs := flag.NewFlagSet("oh-my-usaged", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&o.listen, "listen", firstNonEmpty(getenv(envListen), "127.0.0.1:8080"),
		"HTTP listen address (or "+envListen+")")
	fs.StringVar(&o.logFormat, "log-format", "text", "log format: text or json")
	fs.TextVar(&o.logLevel, "log-level", o.logLevel, "log level: DEBUG, INFO, WARN or ERROR")
	fs.BoolVar(&o.version, "version", false, "print the version and exit")
	fs.StringVar(&o.gatewayURL, "gateway-url", "", "omp auth gateway URL, e.g. https://omp.example.com (or "+envGatewayURL+")")
	fs.StringVar(&o.gatewayTokenFile, "gateway-token-file", "", "file holding the gateway token (or set "+envGatewayToken+")")
	fs.StringVar(&o.brokerURL, "broker-url", "", "omp auth broker URL; enables pausing accounts (or "+envBrokerURL+")")
	fs.StringVar(&o.brokerTokenFile, "broker-token-file", "", "file holding the broker admin token (or set "+envBrokerToken+")")
	fs.StringVar(&o.db, "db", firstNonEmpty(getenv(envDB), "oh-my-usage.db"),
		"SQLite file for the usage history and the traffic record (or "+envDB+")")
	fs.DurationVar(&o.pollInterval, "poll-interval", time.Minute, "time between polls of the gateway, at least 30s")
	fs.DurationVar(&o.trafficInterval, "traffic-interval", 15*time.Second,
		"time between readings of the broker's traffic, at least 5s")
	fs.DurationVar(&o.retention, "retention", 90*24*time.Hour, "how long usage history is kept; 0 keeps it forever")

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return o, errHelp
		}

		return o, fmt.Errorf("flags: %w", err)
	}

	if o.logFormat != "text" && o.logFormat != "json" {
		return o, fmt.Errorf("-log-format %q: text or json", o.logFormat)
	}

	if o.pollInterval < minPollInterval {
		return o, fmt.Errorf("-poll-interval %s: at least %s", o.pollInterval, minPollInterval)
	}

	if o.trafficInterval < minTrafficInterval {
		return o, fmt.Errorf("-traffic-interval %s: at least %s", o.trafficInterval, minTrafficInterval)
	}

	if o.retention < 0 {
		return o, fmt.Errorf("-retention %s: must not be negative", o.retention)
	}

	return o, nil
}

// endpoint is where one omp service is and the token that opens it.
type endpoint struct {
	url   string
	token string
}

// endpoints resolves the gateway, which is required, and the broker, which
// is optional: its endpoint is empty when no broker URL is set.
func (o options) endpoints(getenv func(string) string) (gateway, broker endpoint, err error) {
	gateway.url = firstNonEmpty(o.gatewayURL, getenv(envGatewayURL))
	if gateway.url == "" {
		return gateway, broker, errors.New("no gateway: set -gateway-url or " + envGatewayURL)
	}

	if gateway.token, err = token(o.gatewayTokenFile, getenv(envGatewayToken)); err != nil {
		return gateway, broker, fmt.Errorf("gateway token: %w (set %s or -gateway-token-file)", err, envGatewayToken)
	}

	broker.url = firstNonEmpty(o.brokerURL, getenv(envBrokerURL))
	if broker.url == "" {
		return gateway, broker, nil
	}

	if broker.token, err = token(o.brokerTokenFile, getenv(envBrokerToken)); err != nil {
		return gateway, broker, fmt.Errorf("broker token: %w (set %s or -broker-token-file)", err, envBrokerToken)
	}

	return gateway, broker, nil
}

// token reads a token from a file when one is named, else takes the
// environment's.
func token(file, fromEnv string) (string, error) {
	if file == "" {
		if fromEnv == "" {
			return "", errors.New("not set")
		}

		return fromEnv, nil
	}

	raw, err := os.ReadFile(file)
	if err != nil {
		return "", fmt.Errorf("read token file: %w", err)
	}

	value := strings.TrimSpace(string(raw))
	if value == "" {
		return "", fmt.Errorf("token file %s is empty", file)
	}

	return value, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}

	return ""
}

func run(args []string, getenv func(string) string, stdout, stderr io.Writer) error {
	o, err := parse(args, getenv, stderr)
	if errors.Is(err, errHelp) {
		return nil
	}

	if err != nil {
		return err
	}

	if o.version {
		fmt.Fprintln(stdout, version)

		return nil
	}

	gatewayAt, brokerAt, err := o.endpoints(getenv)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	assets, err := web.FS()
	if err != nil {
		return fmt.Errorf("web assets: %w", err)
	}

	log := newLogger(stderr, o).With("version", version)
	httpClient := &http.Client{Timeout: requestTimeout}

	gateway, err := omp.NewGateway(gatewayAt.url, gatewayAt.token, httpClient)
	if err != nil {
		return fmt.Errorf("gateway: %w", err)
	}

	history, err := store.Open(ctx, o.db)
	if err != nil {
		return err
	}

	defer func() { _ = history.Close() }()

	cfg := monitor.Config{Gateway: gateway, Recorder: history, Interval: o.pollInterval, Retention: o.retention}
	deps := server.Deps{History: history, Traffic: history}

	// Assign the broker and what depends on it only when there is one: a nil
	// pointer in an interface would read as configured.
	var traffic *collector.Collector

	if brokerAt.url != "" {
		broker, brokerErr := omp.NewBroker(brokerAt.url, brokerAt.token, httpClient)
		if brokerErr != nil {
			return fmt.Errorf("broker: %w", brokerErr)
		}

		cfg.Broker = broker
		traffic = collector.New(log, collector.Config{
			Broker: broker, Record: history, Interval: o.trafficInterval, Retention: o.retention,
		})
		deps.Collector = traffic
	}

	watch := monitor.New(log, cfg)
	deps.Monitor = watch

	srv, err := server.New(log,
		server.Config{Listen: o.listen, Name: name, Version: version, PollInterval: o.pollInterval}, assets, deps)
	if err != nil {
		return err
	}

	log.InfoContext(ctx, "starting", "controls", watch.Controls(), "pollInterval", o.pollInterval.String(),
		"trafficInterval", o.trafficInterval.String(), "db", o.db)

	// The loops stop with ctx; wait for their last round before the deferred
	// close of the database they write to.
	var loops sync.WaitGroup

	loops.Go(func() { watch.Run(ctx) })

	if traffic != nil {
		loops.Go(func() { traffic.Run(ctx) })
	}

	defer func() {
		stop()
		loops.Wait()
	}()

	return srv.Run(ctx)
}

// newLogger builds the process logger: text for a terminal, JSON for a log
// collector.
func newLogger(w io.Writer, o options) *slog.Logger {
	opts := &slog.HandlerOptions{Level: o.logLevel}
	if o.logFormat == "json" {
		return slog.New(slog.NewJSONHandler(w, opts))
	}

	return slog.New(slog.NewTextHandler(w, opts))
}

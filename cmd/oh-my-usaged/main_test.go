package main

import (
	"bytes"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/savid/oh-my-usage/pkg/accounts"
)

func TestParse(t *testing.T) {
	t.Parallel()

	defaults := options{
		listen: "127.0.0.1:8080", logFormat: "text", logLevel: slog.LevelInfo,
		db: "oh-my-usage.db", pollInterval: time.Minute, trafficInterval: 15 * time.Second,
		retention: 90 * 24 * time.Hour,
	}

	for name, tc := range map[string]struct {
		args    []string
		env     map[string]string
		want    options
		wantErr string
	}{
		"defaults": {args: nil, want: defaults},
		"listen and db from the environment": {
			env: map[string]string{envListen: "0.0.0.0:8080", envDB: "/data/oh-my-usage.db"},
			want: func() options {
				o := defaults
				o.listen, o.db = "0.0.0.0:8080", "/data/oh-my-usage.db"
				return o
			}(),
		},
		"a flag wins over its variable": {
			args: []string{"-listen", ":9000", "-prices", "/etc/flag.json"},
			env:  map[string]string{envListen: "0.0.0.0:8080", envPrices: "/etc/env.json"},
			want: func() options {
				o := defaults
				o.listen, o.prices = ":9000", "/etc/flag.json"
				return o
			}(),
		},
		"prices from the environment": {
			env: map[string]string{envPrices: "/etc/prices.json"},
			want: func() options {
				o := defaults
				o.prices = "/etc/prices.json"
				return o
			}(),
		},
		"everything set": {
			args: []string{
				"-listen", ":9000", "-log-format", "json", "-log-level", "debug", "-version",
				"-gateway-url", "https://omp.example.com", "-gateway-token-file", "/run/gw",
				"-broker-url", "http://auth-broker:8765", "-broker-token-file", "/run/br",
				"-db", "/data/usage.db", "-prices", "/etc/prices.json", "-poll-interval", "2m", "-traffic-interval", "5s", "-retention", "0",
			},
			want: options{
				listen: ":9000", logFormat: "json", logLevel: slog.LevelDebug, version: true,
				gatewayURL: "https://omp.example.com", gatewayTokenFile: "/run/gw",
				brokerURL: "http://auth-broker:8765", brokerTokenFile: "/run/br",
				db: "/data/usage.db", prices: "/etc/prices.json", pollInterval: 2 * time.Minute, trafficInterval: 5 * time.Second,
			},
		},
		"bad format":         {args: []string{"-log-format", "yaml"}, wantErr: `-log-format "yaml": text or json`},
		"bad level":          {args: []string{"-log-level", "loud"}, wantErr: "flags: "},
		"poll too fast":      {args: []string{"-poll-interval", "5s"}, wantErr: "-poll-interval 5s: at least 30s"},
		"traffic too fast":   {args: []string{"-traffic-interval", "1s"}, wantErr: "-traffic-interval 1s: at least 5s"},
		"negative retention": {args: []string{"-retention", "-1h"}, wantErr: "-retention"},
		"unknown":            {args: []string{"-nope"}, wantErr: "flags: "},
		"help wanted":        {args: []string{"-h"}, wantErr: errHelp.Error()},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			var stderr bytes.Buffer

			got, err := parse(tc.args, env(tc.env), &stderr)

			switch {
			case tc.wantErr == "" && err != nil:
				t.Fatalf("parse(%q) = %v", tc.args, err)
			case tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)):
				t.Fatalf("parse(%q) error = %v, want %q", tc.args, err, tc.wantErr)
			case err == nil && got != tc.want:
				t.Fatalf("parse(%q) = %+v, want %+v", tc.args, got, tc.want)
			}
		})
	}
}

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestEndpoints(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	tokenFile := filepath.Join(dir, "token")
	emptyFile := filepath.Join(dir, "empty")

	for path, content := range map[string]string{tokenFile: "from-file\n", emptyFile: "\n"} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	for name, tc := range map[string]struct {
		options     options
		env         map[string]string
		wantGateway endpoint
		wantBroker  endpoint
		wantErr     string
	}{
		"gateway from the environment, no broker": {
			env:         map[string]string{envGatewayURL: "https://gw", envGatewayToken: "gw-token"},
			wantGateway: endpoint{"https://gw", "gw-token"},
		},
		"flags win and a file beats the environment": {
			options: options{gatewayURL: "https://flag", gatewayTokenFile: tokenFile, brokerURL: "http://broker"},
			env: map[string]string{
				envGatewayURL: "https://env", envGatewayToken: "ignored", envBrokerToken: "br-token",
			},
			wantGateway: endpoint{"https://flag", "from-file"},
			wantBroker:  endpoint{"http://broker", "br-token"},
		},
		"no gateway": {wantErr: "no gateway"},
		"no gateway token": {
			env: map[string]string{envGatewayURL: "https://gw"}, wantErr: "gateway token: not set",
		},
		"broker without a token": {
			env:     map[string]string{envGatewayURL: "https://gw", envGatewayToken: "t", envBrokerURL: "http://broker"},
			wantErr: "broker token: not set",
		},
		"a broker token alone configures no broker": {
			env:         map[string]string{envGatewayURL: "https://gw", envGatewayToken: "t", envBrokerToken: "unused"},
			wantGateway: endpoint{"https://gw", "t"},
		},
		"empty token file": {
			options: options{gatewayURL: "https://gw", gatewayTokenFile: emptyFile}, wantErr: "is empty",
		},
		"missing token file": {
			options: options{gatewayURL: "https://gw", gatewayTokenFile: filepath.Join(dir, "nope")}, wantErr: "read token file",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			gateway, broker, err := tc.options.endpoints(env(tc.env))

			switch {
			case tc.wantErr == "" && err != nil:
				t.Fatalf("endpoints() = %v", err)
			case tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)):
				t.Fatalf("endpoints() error = %v, want %q", err, tc.wantErr)
			case err == nil && (gateway != tc.wantGateway || broker != tc.wantBroker):
				t.Fatalf("endpoints() = %+v %+v, want %+v %+v", gateway, broker, tc.wantGateway, tc.wantBroker)
			}
		})
	}
}

func TestPrices(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	good := filepath.Join(dir, "prices.json")
	bad := filepath.Join(dir, "bad.json")

	for path, content := range map[string]string{
		good: `{"providers": {"anthropic": 200}}`,
		bad:  `{"providers": {"anthropic": -1}}`,
	} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	seat := accounts.Account{ID: "a1", Provider: "anthropic"}

	none, err := prices("")
	if err != nil {
		t.Fatal(err)
	}

	if got, priced := none.Monthly(seat); priced {
		t.Errorf("no price file priced %v", got)
	}

	table, err := prices(good)
	if err != nil {
		t.Fatal(err)
	}

	if got, priced := table.Monthly(seat); !priced || got != 200 {
		t.Errorf("Monthly = %v %v, want 200", got, priced)
	}

	if _, err = prices(bad); err == nil || !strings.Contains(err.Error(), bad) ||
		!strings.Contains(err.Error(), `providers["anthropic"]`) {
		t.Errorf("prices(bad) = %v", err)
	}

	if _, err = prices(filepath.Join(dir, "nope.json")); err == nil || !strings.Contains(err.Error(), "nope.json") {
		t.Errorf("prices(missing) = %v", err)
	}

	// A bad file stops the daemon before it starts.
	var stdout, stderr bytes.Buffer

	startup := env(map[string]string{envGatewayURL: "https://gw", envGatewayToken: "t", envPrices: bad})
	if err = run(nil, startup, &stdout, &stderr); err == nil || !strings.Contains(err.Error(), "price file "+bad) {
		t.Errorf("run with a bad price file = %v", err)
	}
}

func TestRunPrintsVersionAndHelp(t *testing.T) {
	t.Parallel()

	var stdout, stderr bytes.Buffer

	none := env(nil)

	if err := run([]string{"-version"}, none, &stdout, &stderr); err != nil || strings.TrimSpace(stdout.String()) != version {
		t.Fatalf("run(-version) = %v, stdout %q", err, stdout.String())
	}

	stdout.Reset()

	if err := run([]string{"-h"}, none, &stdout, &stderr); err != nil || !strings.Contains(stderr.String(), "-gateway-url") {
		t.Fatalf("run(-h) = %v, stderr %q", err, stderr.String())
	}

	err := run([]string{"-log-format", "yaml"}, none, &stdout, &stderr)
	if err == nil || errors.Is(err, errHelp) {
		t.Fatalf("run(bad flag) = %v", err)
	}

	if err = run(nil, none, &stdout, &stderr); err == nil || !strings.Contains(err.Error(), "no gateway") {
		t.Fatalf("run without a gateway = %v", err)
	}
}

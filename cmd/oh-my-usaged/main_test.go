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
		want    options
		wantErr string
	}{
		"defaults": {args: nil, want: defaults},
		"everything set": {
			args: []string{
				"-listen", ":9000", "-log-format", "json", "-log-level", "debug", "-version",
				"-gateway-url", "https://omp.example.com", "-gateway-token-file", "/run/gw",
				"-broker-url", "http://auth-broker:8765", "-broker-token-file", "/run/br",
				"-db", "/data/usage.db", "-poll-interval", "2m", "-traffic-interval", "5s", "-retention", "0",
			},
			want: options{
				listen: ":9000", logFormat: "json", logLevel: slog.LevelDebug, version: true,
				gatewayURL: "https://omp.example.com", gatewayTokenFile: "/run/gw",
				brokerURL: "http://auth-broker:8765", brokerTokenFile: "/run/br",
				db: "/data/usage.db", pollInterval: 2 * time.Minute, trafficInterval: 5 * time.Second,
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

			got, err := parse(tc.args, &stderr)

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

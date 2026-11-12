// Package omp talks to an omp auth gateway and auth broker over HTTP.
//
// The gateway reports usage and is read-only. The broker holds the stored
// logins: its snapshot carries live access tokens and API keys, which this
// package never decodes, and it is the only place a credential can be blocked.
package omp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"strings"
)

// maxBody bounds a response body. A usage report for a few dozen accounts is
// tens of kilobytes.
const maxBody = 16 << 20

// maxErrorDetail bounds how much of an error response is quoted.
const maxErrorDetail = 200

// StatusError is a response outside 2xx.
type StatusError struct {
	Method string
	Path   string
	Status int
	// Detail is the response's `error` string, when it had one.
	Detail string
}

func (e *StatusError) Error() string {
	if e.Detail == "" {
		return fmt.Sprintf("%s %s: HTTP %d", e.Method, e.Path, e.Status)
	}

	return fmt.Sprintf("%s %s: HTTP %d: %s", e.Method, e.Path, e.Status, e.Detail)
}

// client is one bearer-authenticated JSON endpoint.
type client struct {
	base  *url.URL
	token string
	http  *http.Client
}

func newClient(baseURL, token string, httpClient *http.Client) (*client, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse URL: %w", err)
	}

	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, errors.New("URL must be http(s)://host[:port]")
	}

	if token == "" {
		return nil, errors.New("token is empty")
	}

	u.Path = strings.TrimRight(u.Path, "/")
	u.RawQuery, u.Fragment = "", ""

	return &client{base: u, token: token, http: httpClient}, nil
}

// do sends one request and decodes a 2xx JSON response into out, when out is
// not nil. Response bodies are never logged or returned: a broker snapshot
// carries secrets.
func (c *client) do(ctx context.Context, method, path string, header http.Header, body, out any) error {
	var reader io.Reader

	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("%s %s: encode request: %w", method, path, err)
		}

		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.base.String()+path, reader)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}

	maps.Copy(req.Header, header)

	req.Header.Set("Accept", "application/json")

	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, redact(err))
	}

	defer func() { _ = res.Body.Close() }()

	limited := io.LimitReader(res.Body, maxBody)

	if res.StatusCode < 200 || res.StatusCode > 299 {
		return &StatusError{Method: method, Path: path, Status: res.StatusCode, Detail: errorDetail(limited)}
	}

	if out == nil {
		_, _ = io.Copy(io.Discard, limited)

		return nil
	}

	if err = json.NewDecoder(limited).Decode(out); err != nil {
		return fmt.Errorf("%s %s: decode response: %w", method, path, err)
	}

	return nil
}

// redact drops the URL from a transport error: only the path is reported,
// by the caller.
func redact(err error) error {
	if urlErr, ok := errors.AsType[*url.Error](err); ok {
		return urlErr.Err
	}

	return err
}

// errorDetail reads omp's `{"error": "..."}` body.
func errorDetail(body io.Reader) string {
	var payload struct {
		Error string `json:"error"`
	}

	if err := json.NewDecoder(body).Decode(&payload); err != nil {
		return ""
	}

	if len(payload.Error) > maxErrorDetail {
		return payload.Error[:maxErrorDetail]
	}

	return payload.Error
}

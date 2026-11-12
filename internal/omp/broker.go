package omp

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/savid/oh-my-usage/pkg/accounts"
)

// Broker is an omp auth broker, reached with its admin token. That token can
// read every stored access token, so treat it like the credentials themselves.
type Broker struct {
	c *client
}

// NewBroker returns a client for the broker at baseURL, e.g.
// http://auth-broker:8765.
func NewBroker(baseURL, token string, httpClient *http.Client) (*Broker, error) {
	c, err := newClient(baseURL, token, httpClient)
	if err != nil {
		return nil, err
	}

	return &Broker{c: c}, nil
}

// snapshotHeader asks for Codex's real per-meter block scopes instead of the
// combined view older clients get.
var snapshotHeader = http.Header{"Omp-Auth-Broker-Capabilities": {"codex-meter-block-scopes"}}

// Credentials lists the broker's active credentials and their blocks.
func (b *Broker) Credentials(ctx context.Context) ([]accounts.Credential, error) {
	var out struct {
		Credentials []snapshotEntry `json:"credentials"`
	}

	if err := b.c.do(ctx, http.MethodGet, "/v1/snapshot", snapshotHeader, nil, &out); err != nil {
		return nil, err
	}

	credentials := make([]accounts.Credential, 0, len(out.Credentials))
	for _, e := range out.Credentials {
		credentials = append(credentials, e.credential())
	}

	return credentials, nil
}

// snapshotEntry is one credential of the broker's /v1/snapshot.
type snapshotEntry struct {
	ID       int64  `json:"id"`
	Provider string `json:"provider"`
	Blocks   []struct {
		BlockScope     string `json:"blockScope"`
		BlockedUntilMs int64  `json:"blockedUntilMs"`
	} `json:"blocks"`
	// Credential deliberately has no field for `access`, `key` or any other
	// secret the snapshot carries: what is not decoded cannot leak.
	Credential struct {
		Type      string `json:"type"`
		Email     string `json:"email"`
		AccountID string `json:"accountId"`
		OrgID     string `json:"orgId"`
		OrgName   string `json:"orgName"`
	} `json:"credential"`
}

func (e snapshotEntry) credential() accounts.Credential {
	out := accounts.Credential{
		ID:        e.ID,
		Provider:  e.Provider,
		Kind:      e.Credential.Type,
		Email:     e.Credential.Email,
		AccountID: e.Credential.AccountID,
		OrgID:     e.Credential.OrgID,
		OrgName:   e.Credential.OrgName,
	}

	for _, block := range e.Blocks {
		out.Blocks = append(out.Blocks, accounts.Block{Scope: block.BlockScope, Until: fromMillis(block.BlockedUntilMs)})
	}

	return out
}

type blockBody struct {
	ProviderKey    string `json:"providerKey"`
	BlockScope     string `json:"blockScope"`
	BlockedUntilMs *int64 `json:"blockedUntilMs,omitempty"`
}

// SetBlock blocks a credential in one scope until a deadline. The broker
// keeps the later of an existing deadline and the new one.
func (b *Broker) SetBlock(ctx context.Context, credentialID int64, providerKey, scope string, until time.Time) error {
	ms := until.UnixMilli()

	return b.c.do(ctx, http.MethodPost, blockPath(credentialID), nil,
		blockBody{ProviderKey: providerKey, BlockScope: scope, BlockedUntilMs: &ms}, nil)
}

// DeleteBlock removes a credential's block in one scope; removing a block
// that is not there succeeds.
func (b *Broker) DeleteBlock(ctx context.Context, credentialID int64, providerKey, scope string) error {
	return b.c.do(ctx, http.MethodDelete, blockPath(credentialID), nil,
		blockBody{ProviderKey: providerKey, BlockScope: scope}, nil)
}

func blockPath(credentialID int64) string {
	return "/v1/credential/" + strconv.FormatInt(credentialID, 10) + "/block"
}

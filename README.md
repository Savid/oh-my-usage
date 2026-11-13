<img src="web/public/logo.svg" alt="" width="72" height="72" align="right" />

# oh-my-usage

A dashboard for an [omp](https://github.com/can1357/oh-my-pi) auth gateway:
how much of each account's quota is used, when it resets, and what traffic is
passing through. One static binary with the UI built in.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/accounts-dark.png" />
  <img src="docs/screenshots/accounts-light.png" alt="The accounts page: a total for each provider, the last hour of traffic, and a band for each account drawn over its last seven days" width="800" />
</picture>

- **Accounts**: every account the gateway reports, with each usage window,
  when it resets, and a week of history. Amber ▲ at 80% used, red ■ at 100%.
- **An account's page**: each window's pace and whether it runs out before it
  resets, its saved resets, and any blocks omp has put on it.
- **Traffic** (needs the broker): requests, tokens and cost at API prices, by
  provider, by the minute and by the hour.
- **Pause** (needs the broker): move omp's traffic off an account and back.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/traffic-dark.png" />
  <img src="docs/screenshots/traffic-light.png" alt="The Traffic page: the last hour, day and week by provider, the last hour by minute, the last week by hour, and the clients" width="800" />
</picture>

## Quick start

```bash
pnpm install
make build WEB=1

export OH_MY_USAGE_GATEWAY_TOKEN=...   # the gateway's bearer token
export OH_MY_USAGE_BROKER_TOKEN=...    # optional: the broker's admin token
build/bin/oh-my-usaged \
  -gateway-url http://auth-gateway:4019 \
  -broker-url http://auth-broker:8765  # optional
```

Then open http://127.0.0.1:8080. Needs Go 1.27, Node 26 and pnpm 12.

## Configuration

| Flag                  | Environment                 | Default          |                                                    |
| --------------------- | --------------------------- | ---------------- | -------------------------------------------------- |
| `-gateway-url`        | `OH_MY_USAGE_GATEWAY_URL`   | required         | The omp auth gateway.                              |
| `-gateway-token-file` | `OH_MY_USAGE_GATEWAY_TOKEN` | required         | Its token, from a file or the variable.            |
| `-broker-url`         | `OH_MY_USAGE_BROKER_URL`    |                  | The omp auth broker: turns on traffic and pausing. |
| `-broker-token-file`  | `OH_MY_USAGE_BROKER_TOKEN`  |                  | Its admin token.                                   |
| `-listen`             |                             | `127.0.0.1:8080` |                                                    |
| `-db`                 |                             | `oh-my-usage.db` | SQLite file for history and traffic.               |
| `-poll-interval`      |                             | `1m`             | Gateway polls, at least `30s`.                     |
| `-traffic-interval`   |                             | `15s`            | Broker traffic readings, at least `5s`.            |
| `-retention`          |                             | `2160h` (90d)    | How long history is kept; `0` is forever.          |

Tokens are never taken as flag values, so they stay out of the process list.

## Good to know

- **No login.** Listen on loopback and put it behind an authenticating proxy
  or on a private network such as a tailnet. With a broker it can pause
  accounts, and the broker token can read every stored credential.
- **Cost is at API prices.** On a subscription nothing is billed per token;
  read it as a measure of work done.
- **Traffic before the first run is estimated.** The broker only keeps each
  burst as one entry, so earlier history is drawn a burst per hour. From the
  first reading on it is exact. The broker reports by provider and client,
  not by account or model.
- **A paused account is used last, not never.** omp still falls back to it
  when every other account of the provider is blocked or spent. Redeeming a
  saved Codex reset in omp also clears a pause.

## Development

```bash
make check       # what CI runs
make storybook   # components and pages on :6006
pnpm --dir web dev   # UI on :5173, proxying /api/ to a running daemon
```

Rules and layout are in [AGENTS.md](AGENTS.md) and
[web/AGENTS.md](web/AGENTS.md). The screenshots are the `Showcase` stories.
Built from [Savid/skeleton](https://github.com/Savid/skeleton).

## License

[MIT](LICENSE)

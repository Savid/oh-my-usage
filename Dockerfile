# syntax=docker/dockerfile:1

# Web UI: built first so the Go binary can embed it.
FROM node:26.13.0-trixie-slim AS web
# Node 25+ ships without corepack; take pnpm from its official image.
COPY --from=ghcr.io/pnpm/pnpm:12.18.0 /opt/pnpm /opt/pnpm
RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --frozen-lockfile --store-dir /var/cache/pnpm
COPY web/ web/
RUN pnpm --dir web build

FROM golang:1.27.4 AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    GOWORK=off go mod download
COPY api/ api/
COPY cmd/ cmd/
COPY internal/ internal/
COPY pkg/ pkg/
COPY web/embed.go web/
COPY --from=web /src/web/dist web/dist
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    GOWORK=off CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/oh-my-usaged ./cmd/oh-my-usaged
# /data must belong to the nonroot user before a volume is mounted on it.
RUN mkdir /out/data

# Static binary on distroless, running as nonroot. Dockerfile.release is the
# same image around the binaries GoReleaser builds.
FROM gcr.io/distroless/static-debian13:nonroot
COPY --chown=65532:65532 --from=go /out/data /data
COPY --from=go /out/oh-my-usaged /usr/local/bin/oh-my-usaged
ENV OH_MY_USAGE_LISTEN=0.0.0.0:8080 \
    OH_MY_USAGE_DB=/data/oh-my-usage.db
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/oh-my-usaged"]

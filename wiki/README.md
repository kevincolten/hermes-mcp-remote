# hermes-mcp-remote — architecture & history

See the root [README](../README.md) for the full tool table, deployment compose, and configuration
reference — those are kept current there. This page adds context that doesn't belong in the
README: why this exists, how it fits the rest of the homelab, and pieces added since the original
Obsidian write-up.

## What it is

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is primarily a CLI. This bridge spawns
`hermes ...` and exposes it over **MCP Streamable HTTP** with bearer auth, shipped as a Docker image
built on top of the official `nousresearch/hermes-agent` image with the bridge added as an
s6-supervised service next to the gateway and dashboard — every call runs against the same
`/opt/data` the agent itself uses.

The official `hermes mcp serve` only exposes messaging (list conversations, send). This bridge
exposes the full operator surface instead — ask, run, sessions, logs, profiles, cron, kanban,
skills, plugins, config, and a verbatim `hermes_run` for everything else — because the intended use
is to let Claude (or another MCP client) operate Hermes, not just message it. Long-running calls
(especially `hermes_ask`) can run in the background via `background: true` + `hermes_jobs` polling,
to work around claude.ai's ~2-minute tool-call cap.

Built in preference to the existing community project `mlennie/hermes-mcp`, which is small and
largely inactive, and only covers a fraction of this surface.

## Deployment notes worth preserving

- Published at `ghcr.io/kevincolten/hermes-mcp-remote:latest`, rebuilding weekly on top of the
  latest upstream `nousresearch/hermes-agent` image — so it tracks upstream automatically rather
  than needing a manual bump.
- The bridge itself has **no OAuth of its own** (bearer token only) and is not published outside
  the Docker network — something else (an OAuth gateway like `austindevs-mcp`, or a Cloudflare
  Tunnel + OAuth proxy) has to sit in front of it for claude.ai to reach it, since claude.ai only
  speaks OAuth to custom connectors.
- Runs as the unprivileged `hermes` user (UID 10000) via `s6-setuidgid`, matching the gateway and
  dashboard processes in the same image.
- **2026-09-18 addition**: a second s6 service supervises an OpenAI-compatible API server
  (`api-server`, port 8642), gated on `API_SERVER_ENABLED`/`API_SERVER_KEY` and following the same
  service pattern as `hermes-mcp` (drops to the `hermes` user, exits 125 to stay down instead of
  restart-looping when not configured). This is a separate surface from the MCP bridge — an
  OpenAI-compatible chat completions endpoint against the same Hermes instance.

## Context from the original build (still accurate, not in the README)

- The Hermes dashboard itself is bound to Tailscale-only (`100.83.15.84:9119`), with auth required
  by default since a mid-2026 hardening change upstream.
- **Model routing** (a Hermes-agent-level config choice, not something this bridge controls)
  settled on OpenAI's Codex/ChatGPT subscription (`gpt-5.6`, provider `openai-codex`) rather than
  API billing: **Luna** (lightweight tier) for intake sweeps at **low** reasoning effort, **Sol**
  (flagship) for delegated work like PR review, with a local GLM via Ollama as fallback.
- **Intended use case**: continuously sweep email, GitHub, Trello, Asana, and Slack (via the
  `austindevs-mcp` gateway) for action items across Kevin's businesses and land them in an
  **Obsidian** vault to-do list — deliberately not Hermes's own Kanban, which is built for agent
  work queues rather than personal to-dos. As of 2026-09-18 the intake cron jobs were designed but
  not yet fully wired; the vault + mcpvault write path was confirmed working end-to-end.

## Test

`npm test` runs the bridge against a fake `hermes` binary and checks auth, tool listing, one-shot
calls, profile routing, refusals, failure reporting, timeouts, and background jobs.

# hermes-mcp-remote

Control a [Hermes Agent](https://github.com/NousResearch/hermes-agent) instance from claude.ai, Claude mobile, or any other MCP client.

Hermes is primarily a CLI. This is a small bridge that spawns `hermes ...` and exposes it over **MCP Streamable HTTP** with bearer auth. It ships as a Docker image built on top of the official `nousresearch/hermes-agent` image, with the bridge added as an s6-supervised service next to the gateway and dashboard, so every call runs against the same `/opt/data` the agent uses.

```
claude.ai / Claude mobile
        │  HTTPS
        ▼
your gateway or tunnel          ← OAuth, TLS
        │  HTTP (Docker network)
        ▼
hermes-mcp-remote  (this)       ← bearer token, refusal list, background jobs
        │  spawn
        ▼
hermes CLI  →  /opt/data        ← same container as the gateway + dashboard
```

The official `hermes mcp serve` only exposes messaging (list conversations, send). This exposes the operator surface: ask the agent, sessions, logs, profiles, cron, kanban, skills, plugins, config, and a verbatim `hermes_run` for everything else.

## Tools

| Tool | Runs |
| --- | --- |
| `hermes_ask` | `hermes [-p profile] [-m model] -z "<prompt>"` one-shot agent turn, final text only |
| `hermes_run` | `hermes <args...>` verbatim, with an optional stdin |
| `hermes_help` | `hermes [cmd] --help` |
| `hermes_jobs` | list / get / cancel background jobs |
| `hermes_status`, `hermes_logs`, `hermes_sessions`, `hermes_gateway`, `hermes_profile`, `hermes_cron`, `hermes_kanban`, `hermes_project`, `hermes_config`, `hermes_model`, `hermes_fallback`, `hermes_auth`, `hermes_skills`, `hermes_bundles`, `hermes_plugins`, `hermes_mcp`, `hermes_tools`, `hermes_send`, `hermes_memory`, `hermes_insights`, `hermes_monitoring`, `hermes_approvals`, `hermes_hooks`, `hermes_webhook`, `hermes_peer`, `hermes_pairing`, `hermes_checkpoints`, `hermes_worktree`, `hermes_backup`, `hermes_doctor`, `hermes_dump`, `hermes_security`, `hermes_curator`, `hermes_journey`, `hermes_skin`, `hermes_pets`, `hermes_dashboard` | `hermes <name> <args...>` with a per-command cheat sheet in the description |

Every tool accepts `profile`, `timeout_sec`, and `background`. With `background: true` the call returns a `job_id` right away; poll it with `hermes_jobs`. Use that for agent turns and anything else that can outlast a client's tool-call limit (claude.ai's is about two minutes).

Results are JSON: `status`, `exit_code`, `stdout`, `stderr`, `command`. ANSI escapes are stripped.

### What it refuses

Anything that needs a TTY, never returns, or would mutate the immutable image: `setup`, the chat REPL, `--tui`/`--cli`, `gateway run`, starting the dashboard, `mcp serve`, `sessions browse`, `config edit`, `logs -f`, `console`, `desktop`, `acp`, `serve`, `update`, `uninstall`. Set `HERMES_MCP_ALLOW=update,...` to unblock specific ones. Set `HERMES_MCP_READ_ONLY=1` to allow only read-style commands.

## Deploy

The image is published at `ghcr.io/kevincolten/hermes-mcp-remote:latest` and rebuilds weekly on top of the latest upstream image. Swap it in for `nousresearch/hermes-agent` and add one variable:

```yaml
services:
  hermes:
    image: ghcr.io/kevincolten/hermes-mcp-remote:latest
    command: gateway run
    shm_size: 1gb
    volumes:
      - hermes_data:/opt/data
    environment:
      - HERMES_DASHBOARD=1
      - HERMES_DASHBOARD_BASIC_AUTH_USERNAME=...
      - HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=...
      - HERMES_DASHBOARD_BASIC_AUTH_SECRET=...
      - HERMES_MCP_TOKEN=...          # openssl rand -base64 32
```

See [docker-compose.yml](docker-compose.yml) for the full Coolify example. The bridge listens on `0.0.0.0:8788` inside the container and is not published; reach it over the Docker network from whatever fronts it (`http://hermes:8788/mcp`). If `HERMES_MCP_TOKEN` is unset the service stays down and the rest of the container runs exactly like upstream.

Check it:

```bash
docker exec <container> curl -s localhost:8788/healthz
docker exec <container> s6-svstat /run/service/hermes-mcp
```

### Exposing it to claude.ai

claude.ai connects from Anthropic's servers and only speaks OAuth to custom connectors, so this needs something in front of it: an MCP gateway that does OAuth and forwards with the bearer token, or a Cloudflare Tunnel plus an OAuth proxy. The bridge itself stays on the Docker network.

## Run it outside Docker

Works anywhere the `hermes` CLI is installed:

```bash
git clone https://github.com/kevincolten/hermes-mcp-remote.git
cd hermes-mcp-remote
npm install
cp .env.example .env    # set HERMES_MCP_TOKEN
npm start
```

Set `HERMES_BIN` and `HERMES_HOME` if they differ from the defaults.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HERMES_MCP_TOKEN` | required | Bearer token, 24+ chars |
| `PORT` / `HOST` / `MCP_PATH` | `8788` / `0.0.0.0` / `/mcp` | Listener |
| `HERMES_BIN` / `HERMES_HOME` | `hermes` / `/opt/data` | CLI location and working directory |
| `HERMES_MCP_TIMEOUT_SEC` | `90` | Default per-call timeout (`hermes_ask` defaults to 600) |
| `HERMES_MCP_MAX_TIMEOUT_SEC` | `3600` | Ceiling clients can request |
| `HERMES_MCP_READ_ONLY` | unset | `1` allows only read-style commands |
| `HERMES_MCP_ALLOW` | unset | Comma-separated command names to unblock |
| `HERMES_MCP_MAX_OUTPUT` | `200000` | Bytes kept per stream |
| `HERMES_MCP_JOB_TTL_MIN` | `120` | How long finished jobs stay pollable |

## Security notes

- The token grants whatever the `hermes` user can do in the container, including `-z` prompts with approvals bypassed. Treat it like a shell.
- Keep the gateway's own approval hooks on and never run Hermes with `--yolo`.
- The service runs as the unprivileged `hermes` user (UID 10000) via `s6-setuidgid`, same as the gateway and dashboard.

## Test

```bash
npm test
```

Runs the bridge against a fake `hermes` binary and checks auth, tool listing, one-shot, profile routing, refusals, failure reporting, timeouts, and background jobs.

## License

MIT

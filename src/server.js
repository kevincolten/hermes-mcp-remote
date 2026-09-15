#!/usr/bin/env node
/**
 * hermes-mcp-remote
 *
 * Exposes the `hermes` CLI (Nous Research Hermes Agent) over MCP Streamable
 * HTTP so a remote client such as claude.ai can drive a Hermes instance:
 * ask it questions, inspect sessions and logs, manage profiles, cron jobs,
 * skills, plugins, and so on.
 *
 * Runs inside the Hermes container as an s6 service (see Dockerfile), next to
 * the gateway and dashboard, so every call hits the same /opt/data the agent
 * uses. Auth is a static bearer token; put an OAuth-capable gateway in front
 * of it if the client needs OAuth.
 *
 *   Claude --HTTP--> [gateway] --HTTP--> this server --spawn--> hermes CLI
 */

import { createServer as createHttpServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { COMMAND_GROUPS, blockedReason } from "./commands.js";
import { runHermes, trackJob, jobs, cancelJob, summarize } from "./jobs.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 8788;
const HOST = process.env.HOST || "0.0.0.0";
const MCP_PATH = process.env.MCP_PATH || "/mcp";
const TOKEN = process.env.HERMES_MCP_TOKEN;
const HERMES_BIN = process.env.HERMES_BIN || "hermes";
const HERMES_HOME = process.env.HERMES_HOME || "/opt/data";
const DEFAULT_TIMEOUT_SEC = Number(process.env.HERMES_MCP_TIMEOUT_SEC) || 90;
const MAX_TIMEOUT_SEC = Number(process.env.HERMES_MCP_MAX_TIMEOUT_SEC) || 3600;
const READ_ONLY = process.env.HERMES_MCP_READ_ONLY === "1";
const ALLOW = new Set(
    (process.env.HERMES_MCP_ALLOW || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
);

if (!TOKEN || TOKEN.length < 24) {
    console.error(
        "[hermes-mcp-remote] HERMES_MCP_TOKEN must be set (>= 24 chars). Generate one with:\n" +
            "  openssl rand -base64 32"
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Running hermes
// ---------------------------------------------------------------------------

const common = {
    profile: z.string().optional().describe("Target a named Hermes profile (hermes -p NAME). Omit for the default."),
    timeout_sec: z
        .number()
        .int()
        .min(1)
        .max(MAX_TIMEOUT_SEC)
        .optional()
        .describe(`Kill the command after this many seconds (default ${DEFAULT_TIMEOUT_SEC}).`),
    background: z
        .boolean()
        .optional()
        .describe(
            "Return a job_id immediately instead of waiting. Use hermes_jobs to poll. " +
                "Set this for anything that may take more than a minute."
        )
};

function buildArgv(prefix, args, profile) {
    const argv = [];
    if (profile) argv.push("-p", profile);
    argv.push(...prefix, ...(args || []));
    return argv;
}

function textResult(obj, isError = false) {
    return { isError, content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

async function execute(argv, { timeout_sec, background, stdin }) {
    const reason = blockedReason(argv, { readOnly: READ_ONLY, allow: ALLOW });
    if (reason) return textResult({ error: reason, command: ["hermes", ...argv].join(" ") }, true);

    const timeoutMs = (timeout_sec || DEFAULT_TIMEOUT_SEC) * 1000;
    const job = runHermes({ bin: HERMES_BIN, argv, cwd: HERMES_HOME, env: process.env, timeoutMs, stdin });
    console.error(`[hermes-mcp-remote] ${background ? "bg " : ""}hermes ${argv.join(" ")}`);

    if (background) {
        trackJob(job);
        return textResult({ ...summarize(job, { includeOutput: false }), hint: "poll with hermes_jobs {action:'get', job_id}" });
    }

    await job.done;
    return textResult(summarize(job), job.status !== "done");
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

function buildServer() {
    const server = new McpServer({ name: "hermes", version: "0.1.0" });

    server.registerTool(
        "hermes_ask",
        {
            title: "Ask Hermes",
            description:
                "Send one prompt to the Hermes agent and get its final answer (hermes -z). Tools, memory, skills and " +
                "approvals run as configured for the profile; approvals are auto-bypassed in one-shot mode, so keep " +
                "prompts scoped. Agent turns often exceed a minute: set background=true and poll with hermes_jobs.",
            inputSchema: {
                prompt: z.string().min(1),
                model: z.string().optional().describe("Model override, e.g. anthropic/claude-sonnet-4.6"),
                provider: z.string().optional().describe("Provider override, e.g. openrouter"),
                ...common
            }
        },
        async ({ prompt, model, provider, profile, timeout_sec, background }) => {
            const argv = [];
            if (profile) argv.push("-p", profile);
            if (model) argv.push("-m", model);
            if (provider) argv.push("--provider", provider);
            argv.push("-z", prompt);
            return execute(argv, { timeout_sec: timeout_sec || 600, background });
        }
    );

    server.registerTool(
        "hermes_run",
        {
            title: "Run any hermes command",
            description:
                "Run `hermes <args...>` verbatim. Use this for anything the typed tools don't cover. Interactive and " +
                "foreground commands (setup, chat REPL, --tui, gateway run, dashboard start, update, uninstall) are refused. " +
                "Append --help to any command to see its flags.",
            inputSchema: {
                args: z.array(z.string()).min(1).describe("Argument vector after `hermes`, one element per token."),
                stdin: z.string().optional().describe("Text to feed on stdin, for commands that read it."),
                ...common
            }
        },
        async ({ args, stdin, profile, timeout_sec, background }) =>
            execute(buildArgv([], args, profile), { timeout_sec, background, stdin })
    );

    server.registerTool(
        "hermes_help",
        {
            title: "Hermes CLI help",
            description:
                "Show `hermes --help`, or `hermes <command> [sub] --help` when args are given. Cheap; call it before " +
                "guessing flags.",
            inputSchema: {
                args: z.array(z.string()).optional().describe("Command path, e.g. ['sessions','list']")
            }
        },
        async ({ args }) => execute([...(args || []), "--help"], { timeout_sec: 30 })
    );

    server.registerTool(
        "hermes_jobs",
        {
            title: "Background jobs",
            description: "List, read, or cancel background jobs started with background=true.",
            inputSchema: {
                action: z.enum(["list", "get", "cancel"]),
                job_id: z.string().optional()
            }
        },
        async ({ action, job_id }) => {
            if (action === "list") {
                return textResult([...jobs.values()].map(j => summarize(j, { includeOutput: false })));
            }
            if (!job_id) return textResult({ error: "job_id required" }, true);
            const job = action === "cancel" ? cancelJob(job_id) : jobs.get(job_id);
            if (!job) return textResult({ error: "unknown job_id (jobs expire after a while)" }, true);
            return textResult(summarize(job));
        }
    );

    for (const group of COMMAND_GROUPS) {
        server.registerTool(
            `hermes_${group.name.replace(/-/g, "_")}`,
            {
                title: `hermes ${group.name}`,
                description: group.description,
                inputSchema: {
                    args: z
                        .array(z.string())
                        .optional()
                        .describe(`Tokens after \`hermes ${group.name}\`, one element each. Empty runs the bare command.`),
                    ...common
                }
            },
            async ({ args, profile, timeout_sec, background }) =>
                execute(buildArgv([group.name], args, profile), { timeout_sec, background })
        );
    }

    return server;
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

const sessions = new Map(); // sessionId -> { transport, server }

function authorized(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    if (!m) return false;
    const a = Buffer.from(m[1]);
    const b = Buffer.from(TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function readJsonBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return undefined;
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, readOnly: READ_ONLY, sessions: sessions.size, jobs: jobs.size }));
        return;
    }

    if (url.pathname !== MCP_PATH) {
        res.writeHead(404).end();
        return;
    }

    if (!authorized(req)) {
        res.writeHead(401, { "www-authenticate": 'Bearer realm="hermes-mcp-remote"' }).end();
        return;
    }

    try {
        const sessionId = req.headers["mcp-session-id"];
        let entry = sessionId ? sessions.get(sessionId) : undefined;

        if (!entry) {
            if (req.method !== "POST") {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "Missing or unknown Mcp-Session-Id" }));
                return;
            }
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: id => {
                    sessions.set(id, { transport, server });
                    console.error(`[hermes-mcp-remote] session ${id} opened (${sessions.size} active)`);
                }
            });
            transport.onclose = () => {
                if (transport.sessionId) {
                    sessions.delete(transport.sessionId);
                    console.error(`[hermes-mcp-remote] session ${transport.sessionId} closed`);
                }
            };
            const server = buildServer();
            await server.connect(transport);
            entry = { transport, server };
        }

        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        await entry.transport.handleRequest(req, res, body);
    } catch (err) {
        console.error(`[hermes-mcp-remote] request error: ${err.stack || err}`);
        if (!res.headersSent) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: String(err.message || err) }));
        }
    }
});

httpServer.listen(PORT, HOST, () => {
    console.error(
        `[hermes-mcp-remote] listening on http://${HOST}:${PORT}${MCP_PATH}` +
            ` (bin=${HERMES_BIN}, home=${HERMES_HOME}, read-only=${READ_ONLY}, allow=[${[...ALLOW].join(",")}])`
    );
});

for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
        console.error(`[hermes-mcp-remote] ${sig}, shutting down`);
        httpServer.close();
        for (const id of jobs.keys()) cancelJob(id);
        for (const { transport } of sessions.values()) await transport.close().catch(() => {});
        process.exit(0);
    });
}

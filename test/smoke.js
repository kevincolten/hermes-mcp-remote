// End-to-end smoke test against a fake hermes binary.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chmodSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TOKEN = "smoke-test-token-with-enough-length";
const PORT = 8790;
const root = resolve(import.meta.dirname, "..");
const fake = resolve(root, "test/fake-hermes.sh");
chmodSync(fake, 0o755);

const server = spawn(process.execPath, [resolve(root, "src/server.js")], {
    env: { ...process.env, HERMES_MCP_TOKEN: TOKEN, PORT, HOST: "127.0.0.1", HERMES_BIN: fake, HERMES_HOME: root },
    stdio: ["ignore", "ignore", "pipe"]
});
server.stderr.on("data", d => process.stdout.write(`  [server] ${d}`));

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg); };
const parse = r => JSON.parse(r.content[0].text);

try {
    await new Promise(r => setTimeout(r, 800));
    const url = `http://127.0.0.1:${PORT}/mcp`;

    const unauth = await fetch(url, { method: "POST" });
    assert(unauth.status === 401, "rejects missing bearer");

    const client = new Client({ name: "smoke", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));

    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    assert(names.includes("hermes_ask") && names.includes("hermes_run") && names.includes("hermes_sessions"), `tools registered (${tools.length})`);

    let r = parse(await client.callTool({ name: "hermes_ask", arguments: { prompt: "hi there" } }));
    assert(r.status === "done" && r.stdout.includes("answer to: hi there"), "hermes_ask runs -z");

    r = parse(await client.callTool({ name: "hermes_status", arguments: { profile: "work" } }));
    assert(r.command === "hermes -p work status" && r.stdout.includes("all good"), "profile prefix + typed tool");

    r = parse(await client.callTool({ name: "hermes_run", arguments: { args: ["setup"] } }));
    assert(/refused/.test(r.error), "blocks interactive setup");

    r = parse(await client.callTool({ name: "hermes_run", arguments: { args: ["gateway"] } }));
    assert(/refused/.test(r.error), "blocks bare gateway");

    r = parse(await client.callTool({ name: "hermes_run", arguments: { args: ["fail"] } }));
    assert(r.status === "failed" && r.exit_code === 3 && r.stderr.includes("boom"), "reports failures");

    r = parse(await client.callTool({ name: "hermes_run", arguments: { args: ["sleep", "5"], timeout_sec: 1 } }));
    assert(r.status === "timeout", "timeout kills the child");

    r = parse(await client.callTool({ name: "hermes_run", arguments: { args: ["sleep", "2"], background: true } }));
    assert(r.status === "running" && r.job_id, "background returns a job");
    await new Promise(res => setTimeout(res, 2500));
    const j = parse(await client.callTool({ name: "hermes_jobs", arguments: { action: "get", job_id: r.job_id } }));
    assert(j.status === "done", "job completes and is pollable");

    await client.close();
} finally {
    server.kill();
}

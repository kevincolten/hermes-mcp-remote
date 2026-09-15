/**
 * Runs `hermes ...` as a child process, either awaited or as a background job
 * that clients poll. claude.ai gives up on a tool call after roughly two
 * minutes, and an agent turn can take longer than that, so anything that may
 * run long goes through a job.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const MAX_OUTPUT = Number(process.env.HERMES_MCP_MAX_OUTPUT) || 200_000;
const JOB_TTL_MS = (Number(process.env.HERMES_MCP_JOB_TTL_MIN) || 120) * 60_000;

export const jobs = new Map(); // id -> job

export function runHermes({ bin, argv, cwd, env, timeoutMs, stdin }) {
    const child = spawn(bin, argv, {
        cwd,
        env: { ...env, TERM: "dumb", NO_COLOR: "1", FORCE_COLOR: "0", PYTHONUNBUFFERED: "1" },
        stdio: [stdin != null ? "pipe" : "ignore", "pipe", "pipe"]
    });

    const job = {
        id: randomUUID(),
        argv,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: "running", // running | done | failed | timeout | cancelled
        exitCode: null,
        stdout: "",
        stderr: "",
        truncated: false,
        child,
        done: null
    };

    const append = (field, chunk) => {
        const text = chunk.toString("utf8").replace(ANSI, "");
        if (job[field].length + text.length > MAX_OUTPUT) {
            job[field] = (job[field] + text).slice(-MAX_OUTPUT);
            job.truncated = true;
        } else {
            job[field] += text;
        }
    };
    child.stdout.on("data", c => append("stdout", c));
    child.stderr.on("data", c => append("stderr", c));

    if (stdin != null) {
        child.stdin.end(stdin);
    }

    let timer = null;
    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            job.status = "timeout";
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 5000).unref();
        }, timeoutMs);
    }

    job.done = new Promise(resolve => {
        child.on("error", err => {
            job.stderr += `\n[spawn error] ${err.message}`;
            finish("failed", -1);
        });
        child.on("close", code => finish(job.status === "running" ? (code === 0 ? "done" : "failed") : job.status, code));
        function finish(status, code) {
            if (timer) clearTimeout(timer);
            if (job.finishedAt) return;
            job.status = status;
            job.exitCode = code;
            job.finishedAt = new Date().toISOString();
            job.child = null;
            resolve(job);
        }
    });

    return job;
}

export function trackJob(job) {
    jobs.set(job.id, job);
    job.done.then(() => setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref());
    return job;
}

export function cancelJob(id) {
    const job = jobs.get(id);
    if (!job) return null;
    if (job.child) {
        job.status = "cancelled";
        job.child.kill("SIGTERM");
        setTimeout(() => job.child?.kill("SIGKILL"), 5000).unref();
    }
    return job;
}

export function summarize(job, { includeOutput = true } = {}) {
    const out = {
        job_id: job.id,
        status: job.status,
        exit_code: job.exitCode,
        command: ["hermes", ...job.argv].join(" "),
        started_at: job.startedAt,
        finished_at: job.finishedAt
    };
    if (includeOutput) {
        out.stdout = job.stdout;
        out.stderr = job.stderr;
        if (job.truncated) out.truncated = true;
    }
    return out;
}

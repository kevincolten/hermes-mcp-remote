/**
 * Catalog of hermes CLI command groups exposed as MCP tools, plus the policy
 * that decides which invocations the bridge refuses.
 *
 * Each entry becomes a tool named hermes_<name> that runs `hermes <name> ...`.
 * The description doubles as the subcommand cheat sheet Claude sees, so keep
 * it current with `hermes <name> --help`.
 */

export const COMMAND_GROUPS = [
    {
        name: "status",
        description:
            "Show status of all Hermes components (auth, model, gateway, dashboard, skills). " +
            "Flags: --all (full, redacted), --deep (slower checks)."
    },
    {
        name: "logs",
        description:
            "View Hermes log files. Args: [errors] to read errors.log instead of agent.log; " +
            "-n/--lines N (default 50); --since 1h|30m|2d. Do not pass -f (follow never returns)."
    },
    {
        name: "sessions",
        description:
            "Manage session history. Subcommands: list [--limit N] [--source cli|telegram|...] [--workspace NEEDLE]; " +
            "search <query>; export <id> [--format jsonl|md|qmd]; rename <id> <title>; pin <id>; unpin <id>; pinned; " +
            "archive; prune; delete <id>; stats; optimize; repair; recover."
    },
    {
        name: "gateway",
        description:
            "Messaging gateway management. Subcommands: status; start; stop; restart; install; enroll. " +
            "Bare `gateway` or `gateway run` is refused (foreground process; the s6 supervisor owns it)."
    },
    {
        name: "profile",
        description:
            "Manage profiles, each an isolated Hermes instance. Subcommands: list; create <name>; info <name>; " +
            "describe <name> [text]; delete <name>; alias. Use the top-level `profile` argument on other tools to target one."
    },
    {
        name: "cron",
        description:
            "Scheduled job management. Subcommands: list; create; run <id>; pause <id>; resume <id>; remove <id>; " +
            "runs <id>; incidents; notepad <id>; tick; resnap."
    },
    {
        name: "kanban",
        description:
            "Multi-profile collaboration board. Boards hold cards that agents pick up. Run with --help for the full " +
            "verb list (board create/list, card add/move/comment, link, etc.)."
    },
    {
        name: "project",
        description: "Manage projects (named multi-folder workspaces). Subcommands: list; create; info; trust; untrust."
    },
    {
        name: "config",
        description:
            "View and edit configuration. Subcommands: show; get <key>; set <key> <value>; unset <key>; path; env-path; " +
            "check; migrate. `config edit` is refused (needs an editor)."
    },
    {
        name: "model",
        description:
            "Show or set the default model and provider. Non-interactive form: `model <provider/model>` or with --provider."
    },
    {
        name: "fallback",
        description: "Manage fallback providers tried when the primary model fails. Subcommands: list; add; remove; clear."
    },
    {
        name: "auth",
        description:
            "Manage pooled provider credentials. Subcommands: list; add <provider> (may need a browser, prefer the dashboard); " +
            "remove <provider> <target>; reset <provider> [target]; priority <provider> <target> <n>; refresh <provider> [target]; status."
    },
    {
        name: "skills",
        description:
            "Search, install, configure, and manage skills. Subcommands: list; search <query>; install <name>; inspect <name>; " +
            "remove <name>; diff <name>; list-modified; tap; snapshot; publish."
    },
    {
        name: "bundles",
        description: "Skill bundles (aliases for multiple skills). Subcommands: list; show <name>; create; remove."
    },
    {
        name: "plugins",
        description:
            "Manage plugins. Subcommands: list; search <query>; install <owner/repo|url|catalog name>; enable <name>; " +
            "disable <name>; update <name>; remove <name>; doctor <path>; validate <path>; capabilities; compat; pack."
    },
    {
        name: "mcp",
        description:
            "Manage MCP servers Hermes connects to. Subcommands: list; add <name> ...; remove <name>; test <name>. " +
            "`mcp serve` is refused (stdio server never returns)."
    },
    {
        name: "tools",
        description: "Configure which tools are enabled per platform (cli, telegram, api_server, ...). Run --help for verbs."
    },
    {
        name: "send",
        description:
            "Send a one-shot message to a configured messaging platform without invoking the agent. " +
            "Typical: send --platform telegram --to <chat id> \"text\". Run --help for exact flags."
    },
    {
        name: "memory",
        description: "Configure the external memory provider. Subcommands: status; set; clear (see --help)."
    },
    {
        name: "insights",
        description: "Usage insights and analytics (tokens, cost, activity). Flags vary; run --help."
    },
    {
        name: "monitoring",
        description: "Inspect gateway monitoring (health and diagnostics export)."
    },
    {
        name: "approvals",
        description: "Approval-prompt tools. Subcommands: suggest (propose command_allowlist entries from history); test."
    },
    {
        name: "hooks",
        description: "Inspect and manage shell-script hooks."
    },
    {
        name: "webhook",
        description: "Manage dynamic webhook subscriptions. Subcommands: list; subscribe; remove; test."
    },
    {
        name: "peer",
        description: "Bot-to-bot DMs across machines (peer Hermes gateways)."
    },
    {
        name: "pairing",
        description: "Manage DM pairing codes that authorize new users on messaging platforms."
    },
    {
        name: "checkpoints",
        description: "Inspect, prune, or clear file checkpoints."
    },
    {
        name: "worktree",
        description: "Audit and reclaim accumulated git worktrees and merged branches. Subcommands: list; prune."
    },
    {
        name: "backup",
        description: "Back up the Hermes home directory (/opt/data) to a zip file. Pass an output path under /opt/data."
    },
    {
        name: "doctor",
        description: "Diagnose the install: missing config, broken deps, permission problems."
    },
    {
        name: "dump",
        description: "Dump a setup summary for support and debugging."
    },
    {
        name: "security",
        description: "Supply-chain audit (OSV.dev) for venv, plugins, and MCP servers. Subcommand: audit."
    },
    {
        name: "curator",
        description: "Background skill maintenance. Subcommands: status; run; pause; pin."
    },
    {
        name: "journey",
        description: "Timeline of learned skills and memories over time."
    },
    {
        name: "skin",
        description: "List, switch, and tweak skins. Subcommands: list; use <name>."
    },
    {
        name: "pets",
        description: "Browse, install, and select animated pets."
    },
    {
        name: "dashboard",
        description:
            "Web dashboard control. Only --status and --stop are allowed here; starting it is the supervisor's job " +
            "(HERMES_DASHBOARD=1 on the container)."
    }
];

/**
 * Invocations that would hang the bridge, need a TTY, or mutate the immutable
 * image. Matched against the argv after any `-p <profile>` prefix.
 * Each rule: [predicate(argv) => boolean, reason].
 */
const BLOCKED = [
    [a => a.includes("--tui") || a.includes("--cli"), "interactive UI"],
    [a => a[0] === "setup", "interactive wizard; use the dashboard or `config set`"],
    [a => a[0] === "chat" && !a.includes("-q") && !a.includes("--query"), "interactive REPL; use hermes_ask"],
    [a => a[0] === "uninstall", "would remove Hermes"],
    [a => a[0] === "update", "the Docker image is immutable; redeploy with a newer image instead"],
    [a => ["desktop", "gui", "console", "acp", "serve", "proxy", "lsp"].includes(a[0]), "long-running or TTY-bound process"],
    [a => a[0] === "gateway" && (a.length === 1 || a[1] === "run"), "foreground gateway; s6 already supervises it"],
    [a => a[0] === "dashboard" && !a.includes("--status") && !a.includes("--stop"), "foreground dashboard; s6 already supervises it"],
    [a => a[0] === "mcp" && a[1] === "serve", "stdio server never returns"],
    [a => a[0] === "sessions" && a[1] === "browse", "interactive picker; use `sessions list`"],
    [a => a[0] === "config" && a[1] === "edit", "opens an editor"],
    [a => a[0] === "logs" && (a.includes("-f") || a.includes("--follow")), "follow mode never returns"],
    [a => a[0] === "moa" && a[1] === "configure", "interactive picker"],
    [a => a[0] === "kanban" && a.includes("--tui"), "interactive UI"]
];

/** Read-only allowlist used when HERMES_MCP_READ_ONLY=1. */
const READ_ONLY_OK = [
    a => a[0] === "status",
    a => a[0] === "logs",
    a => a[0] === "sessions" && ["list", "search", "export", "pinned", "stats", undefined].includes(a[1]),
    a => a[0] === "gateway" && a[1] === "status",
    a => a[0] === "profile" && ["list", "info", undefined].includes(a[1]),
    a => a[0] === "cron" && ["list", "runs", "incidents", "notepad", undefined].includes(a[1]),
    a => a[0] === "config" && ["show", "get", "path", "env-path", "check", undefined].includes(a[1]),
    a => a[0] === "auth" && ["list", "status", undefined].includes(a[1]),
    a => a[0] === "skills" && ["list", "search", "inspect", "diff", "list-modified", undefined].includes(a[1]),
    a => a[0] === "plugins" && ["list", "search", "capabilities", "compat", undefined].includes(a[1]),
    a => a[0] === "mcp" && ["list", "test", undefined].includes(a[1]),
    a => a[0] === "dashboard" && a[1] === "--status",
    a => ["insights", "monitoring", "doctor", "dump", "journey", "version", "--version", "-V"].includes(a[0]),
    a => a.includes("--help") || a.includes("-h")
];

export function blockedReason(argv, { readOnly, allow }) {
    const a = stripProfile(argv);
    if (a.length === 0) return "empty command would start the interactive REPL";
    for (const [pred, reason] of BLOCKED) {
        if (pred(a)) {
            const key = a[0]?.replace(/^-+/, "");
            if (allow.has(key)) continue;
            return `refused: ${reason}`;
        }
    }
    if (readOnly && !READ_ONLY_OK.some(p => p(a))) {
        return "refused: bridge is in read-only mode (HERMES_MCP_READ_ONLY=1)";
    }
    return null;
}

function stripProfile(argv) {
    const a = [...argv];
    while (a.length && (a[0] === "-p" || a[0] === "--profile")) a.splice(0, 2);
    return a;
}

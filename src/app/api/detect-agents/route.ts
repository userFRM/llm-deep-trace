import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const HOME = process.env.HOME || "/root";

function resolve(p: string) {
  return p.startsWith("~/") ? path.join(HOME, p.slice(2)) : p;
}

function whichBinary(names: string[]): string | null {
  for (const name of names) {
    try {
      const result = execSync(`which ${name} 2>/dev/null`, { encoding: "utf8", timeout: 2000 }).trim();
      if (result) return result;
    } catch { /* not found */ }
  }
  return null;
}

function countSessions(dir: string, ext = ".jsonl"): number {
  try {
    const resolved = resolve(dir);
    if (!fs.existsSync(resolved)) return -1; // -1 = dir missing
    let count = 0;
    const scan = (d: string, depth = 0) => {
      if (depth > 4) return;
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.isDirectory()) scan(path.join(d, entry.name), depth + 1);
          else if (entry.name.endsWith(ext)) count++;
        }
      } catch { /* skip unreadable */ }
    };
    scan(resolved);
    return count;
  } catch { return -1; }
}

function loadConfig(): Record<string, { binaryPath?: string; sessionsDir?: string }> {
  try {
    const p = path.join(HOME, ".llm-deep-trace.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { /* ignore */ }
  return {};
}

const AGENTS = [
  {
    id: "claude",
    name: "Claude Code",
    color: "#3B82F6",
    binaries: ["claude"],
    defaultSessionsDir: "~/.claude/projects",
    sessionExt: ".jsonl",
  },
  {
    id: "codex",
    name: "Codex",
    color: "#F59E0B",
    binaries: ["codex"],
    defaultSessionsDir: "~/.codex/projects",
    sessionExt: ".jsonl",
  },
  {
    id: "kimi",
    name: "Kimi",
    color: "#06B6D4",
    binaries: ["kimi", "kimi-cli"],
    defaultSessionsDir: "~/.kimi/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    color: "#22C55E",
    binaries: ["gemini"],
    defaultSessionsDir: "~/.gemini/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "kova",
    name: "OpenClaw",
    color: "#9B72EF",
    binaries: ["openclaw"],
    defaultSessionsDir: "~/.openclaw/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    color: "#52525B",
    binaries: ["gh"],
    defaultSessionsDir: "~/.config/github-copilot/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "factory",
    name: "Factory Droid",
    color: "#F97316",
    binaries: ["droid"],
    defaultSessionsDir: "~/.factory/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "opencode",
    name: "OpenCode",
    color: "#14B8A6",
    binaries: ["opencode"],
    defaultSessionsDir: "~/.opencode/sessions",
    sessionExt: ".jsonl",
  },
  {
    id: "cursor",
    name: "Cursor",
    color: "#818CF8",
    binaries: ["cursor"],
    defaultSessionsDir: "~/.cursor-server/data/User/workspaceStorage",
    sessionExt: ".json",
  },
  {
    id: "aider",
    name: "Aider",
    color: "#E879F9",
    binaries: ["aider"],
    defaultSessionsDir: "~/",      // aider uses ~/.aider.chat.history.md
    sessionExt: ".md",
  },
  {
    id: "continue",
    name: "Continue.dev",
    color: "#FB923C",
    binaries: ["continue"],
    defaultSessionsDir: "~/.continue/sessions",
    sessionExt: ".json",
  },
];

export async function GET() {
  const config = loadConfig();

  const results = AGENTS.map((agent) => {
    const override = config[agent.id] || {};
    const binaryPath = override.binaryPath || whichBinary(agent.binaries);
    const sessionsDir = override.sessionsDir || agent.defaultSessionsDir;
    const count = countSessions(sessionsDir, agent.sessionExt);

    return {
      id: agent.id,
      name: agent.name,
      color: agent.color,
      binary: {
        found: !!binaryPath,
        path: binaryPath,
        isCustom: !!override.binaryPath,
      },
      sessions: {
        found: count > 0,
        dir: sessionsDir,
        defaultDir: agent.defaultSessionsDir,
        count: Math.max(0, count),
        dirExists: count >= 0,
        isCustom: !!override.sessionsDir,
      },
    };
  });

  return NextResponse.json({ agents: results });
}

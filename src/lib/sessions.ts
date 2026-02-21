import fs from "fs";
import path from "path";
import os from "os";
import { SessionInfo, RawEntry } from "./types";

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, ".openclaw", "agents", "main", "sessions");
const SESSIONS_INDEX = path.join(SESSIONS_DIR, "sessions.json");

export function parseJsonl(filePath: string): RawEntry[] {
  const entries: RawEntry[] = [];
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    for (const line of data.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        continue;
      }
    }
  } catch {
    // file not readable
  }
  return entries;
}

export function findSessionFiles(): Record<
  string,
  { path: string; isActive: boolean; isDeleted: boolean; isReset: boolean }
> {
  const result: Record<
    string,
    { path: string; isActive: boolean; isDeleted: boolean; isReset: boolean }
  > = {};
  if (!fs.existsSync(SESSIONS_DIR)) return result;

  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith(".jsonl") && !name.includes(".jsonl.")) continue;
    if (name.endsWith(".lock") || name.endsWith(".bak")) continue;

    const sessionId = name.split(".jsonl")[0];
    const isDeleted = name.includes(".deleted.");
    const isReset = name.includes(".reset.");

    if (sessionId in result && result[sessionId].isActive) continue;

    result[sessionId] = {
      path: path.join(SESSIONS_DIR, name),
      isActive: !isDeleted && !isReset,
      isDeleted,
      isReset,
    };
  }
  return result;
}

export function getMessagePreview(entries: RawEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message") continue;
    const msg = (entry.message || {}) as Record<string, unknown>;
    if (msg.role !== "user") continue;
    const content = msg.content;
    const texts: string[] = [];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "text"
        ) {
          texts.push(((block as Record<string, unknown>).text as string) || "");
        }
      }
    } else if (typeof content === "string") {
      texts.push(content);
    }
    let text = texts.join(" ").trim();
    if (text.startsWith("Conversation info")) {
      const parts = text.split("\n");
      let foundClose = false;
      const cleanParts: string[] = [];
      for (const p of parts) {
        if (foundClose) cleanParts.push(p);
        else if (p.trim() === "```") foundClose = true;
      }
      text = cleanParts.length ? cleanParts.join(" ").trim() : text;
    }
    if (text) return text.slice(0, 120);
  }
  return "";
}

export function countMessages(entries: RawEntry[]): number {
  return entries.filter((e) => e.type === "message").length;
}

export function loadSessionsIndex(): Record<string, Record<string, unknown>> {
  try {
    if (fs.existsSync(SESSIONS_INDEX)) {
      return JSON.parse(fs.readFileSync(SESSIONS_INDEX, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {};
}

export function listKovaSessions(): SessionInfo[] {
  const index = loadSessionsIndex();
  const idToKey: Record<string, string> = {};
  const idToMeta: Record<string, Record<string, unknown>> = {};
  for (const [key, meta] of Object.entries(index)) {
    const sid = (meta.sessionId as string) || "";
    if (sid) {
      idToKey[sid] = key;
      idToMeta[sid] = meta;
    }
  }

  const files = findSessionFiles();
  const sessions: SessionInfo[] = [];

  for (const [sessionId, info] of Object.entries(files)) {
    const entries = parseJsonl(info.path);
    const key = idToKey[sessionId] || "";
    const meta = idToMeta[sessionId] || {};

    let updatedAt = (meta.updatedAt as number) || 0;
    if (!updatedAt) {
      try {
        updatedAt = Math.floor(fs.statSync(info.path).mtimeMs);
      } catch {
        updatedAt = 0;
      }
    }

    const isSubagent = key.includes("subagent") || key.includes(":sub:");

    sessions.push({
      sessionId,
      key,
      lastUpdated: updatedAt,
      channel: (meta.lastChannel as string) || "",
      chatType: (meta.chatType as string) || "",
      messageCount: countMessages(entries),
      preview: getMessagePreview(entries),
      isActive: info.isActive,
      isDeleted: info.isDeleted,
      isSubagent,
      compactionCount: (meta.compactionCount as number) || 0,
      source: "kova",
    });
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

export function listClaudeSessions(): SessionInfo[] {
  const projectsDir = path.join(HOME, ".claude", "projects");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(projectsDir)) return sessions;

  for (const dirName of fs.readdirSync(projectsDir)) {
    const projectDir = path.join(projectsDir, dirName);
    if (!fs.statSync(projectDir).isDirectory()) continue;

    let projectLabel = dirName.replace(/^-/, "").replace(/-/g, "/");
    if (projectLabel.startsWith("home/")) {
      const idx = projectLabel.indexOf("/", 5);
      projectLabel = "~/" + (idx >= 0 ? projectLabel.slice(idx + 1) : projectLabel);
    }

    const jsonlFiles: string[] = [];
    // Direct JSONL files
    for (const f of fs.readdirSync(projectDir)) {
      if (f.endsWith(".jsonl") && !f.endsWith(".lock") && !f.endsWith(".bak")) {
        jsonlFiles.push(path.join(projectDir, f));
      }
    }
    // Subagent JSONL files
    const subagentsDir = path.join(projectDir, "subagents");
    if (fs.existsSync(subagentsDir)) {
      for (const subDir of fs.readdirSync(subagentsDir)) {
        const subPath = path.join(subagentsDir, subDir);
        if (fs.statSync(subPath).isDirectory()) {
          for (const f of fs.readdirSync(subPath)) {
            if (f.endsWith(".jsonl") && !f.endsWith(".lock") && !f.endsWith(".bak")) {
              jsonlFiles.push(path.join(subPath, f));
            }
          }
        } else if (subDir.endsWith(".jsonl") && !subDir.endsWith(".lock") && !subDir.endsWith(".bak")) {
          jsonlFiles.push(subPath);
        }
      }
    }

    for (const filePath of jsonlFiles) {
      const entries = parseJsonl(filePath);
      let updatedAt = 0;
      try {
        updatedAt = Math.floor(fs.statSync(filePath).mtimeMs);
      } catch {
        updatedAt = 0;
      }

      let preview = "";
      let msgCount = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.type === "user" && !preview) {
          const msg = (e.message || {}) as Record<string, unknown>;
          const content = msg.content;
          if (typeof content === "string") {
            preview = content.slice(0, 120);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                ((block as Record<string, unknown>).type === "input_text" ||
                  (block as Record<string, unknown>).type === "text")
              ) {
                preview = (
                  ((block as Record<string, unknown>).text as string) || ""
                ).slice(0, 120);
                break;
              }
            }
          }
        }
        if (e.type === "user" || e.type === "assistant") msgCount++;
      }

      const isSubagent = filePath.includes("subagents");
      const parentId = isSubagent ? path.basename(path.dirname(path.dirname(filePath))) : undefined;
      const sessionId = path.basename(filePath, ".jsonl");

      sessions.push({
        sessionId,
        key:
          projectLabel +
          (isSubagent ? "/" + sessionId.slice(0, 8) : ""),
        label: isSubagent
          ? "\u21b3 subagent " + sessionId.slice(0, 8)
          : projectLabel,
        lastUpdated: updatedAt,
        channel: "claude-code",
        chatType: "direct",
        messageCount: msgCount,
        preview,
        isActive: true,
        isDeleted: false,
        isSubagent,
        parentSessionId: parentId,
        compactionCount: 0,
        source: "claude",
      });
    }
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

export function listCodexSessions(): SessionInfo[] {
  const codexDir = path.join(HOME, ".codex", "sessions");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(codexDir)) return sessions;

  function findRolloutFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findRolloutFiles(fullPath));
        } else if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
          results.push(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  for (const filePath of findRolloutFiles(codexDir)) {
    const entries = parseJsonl(filePath);
    let meta: Record<string, unknown> = {};
    let msgCount = 0;
    let preview = "";

    for (const e of entries) {
      if (e.type === "session_meta" && !Object.keys(meta).length) {
        meta = (e.payload as Record<string, unknown>) || {};
      }
      if (e.type === "response_item") {
        const payload = (e.payload as Record<string, unknown>) || {};
        const role = payload.role as string;
        if (role === "user" || role === "assistant") msgCount++;
        if (role === "user" && !preview) {
          const content = payload.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                (block as Record<string, unknown>).type === "input_text"
              ) {
                preview = (
                  ((block as Record<string, unknown>).text as string) || ""
                ).slice(0, 120);
                break;
              }
            }
          }
        }
      }
    }

    let updatedAt = 0;
    try {
      updatedAt = Math.floor(fs.statSync(filePath).mtimeMs);
    } catch {
      updatedAt = 0;
    }

    const cwd = (meta.cwd as string) || "";
    const label = cwd ? path.basename(cwd) : path.basename(filePath, ".jsonl").slice(0, 16);
    const model = (meta.model_provider as string) || "openai";
    const sessionId = (meta.id as string) || path.basename(filePath, ".jsonl");

    sessions.push({
      sessionId,
      key: label,
      label,
      lastUpdated: updatedAt,
      channel: `codex/${model}`,
      chatType: "direct",
      messageCount: msgCount,
      preview,
      isActive: true,
      isDeleted: false,
      isSubagent: false,
      compactionCount: 0,
      source: "codex",
      model,
      cwd,
    });
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

export function getSessionMessages(
  sessionId: string,
  source: string
): RawEntry[] | null {
  if (source === "claude") {
    const projectsDir = path.join(HOME, ".claude", "projects");
    if (!fs.existsSync(projectsDir)) return null;

    function findJsonl(dir: string): string | null {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findJsonl(fullPath);
            if (found) return found;
          } else if (entry.name === sessionId + ".jsonl") {
            return fullPath;
          }
        }
      } catch {
        // ignore
      }
      return null;
    }

    const filePath = findJsonl(projectsDir);
    if (filePath) return parseJsonl(filePath);
    return null;
  }

  if (source === "codex") {
    const codexDir = path.join(HOME, ".codex", "sessions");
    if (!fs.existsSync(codexDir)) return null;

    function findRollout(dir: string): string | null {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findRollout(fullPath);
            if (found) return found;
          } else if (
            entry.name.startsWith("rollout-") &&
            entry.name.endsWith(".jsonl")
          ) {
            const entries = parseJsonl(fullPath);
            const meta = entries.find((e) => e.type === "session_meta");
            const payload = (meta?.payload as Record<string, unknown>) || {};
            if (
              payload.id === sessionId ||
              path.basename(entry.name, ".jsonl") === sessionId
            ) {
              return fullPath;
            }
          }
        }
      } catch {
        // ignore
      }
      return null;
    }

    const filePath = findRollout(codexDir);
    if (filePath) return parseJsonl(filePath);
    return null;
  }

  // Default: kova
  const files = findSessionFiles();
  const info = files[sessionId];
  if (!info) return null;
  return parseJsonl(info.path);
}

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
      title: (meta.title as string) || undefined,
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
      filePath: info.path,
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

    const parentSessionIds = new Set<string>();
    const sessionFileMeta: Array<{ filePath: string; isSubagent: boolean; parentSessionId?: string }> = [];

    for (const f of fs.readdirSync(projectDir)) {
      const fullPath = path.join(projectDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && f.endsWith(".jsonl") && !f.endsWith(".lock") && !f.endsWith(".bak")) {
        const uuid = f.replace(/\.jsonl$/, "");
        parentSessionIds.add(uuid);
        sessionFileMeta.push({ filePath: fullPath, isSubagent: false });
      }
    }

    for (const f of fs.readdirSync(projectDir)) {
      const fullPath = path.join(projectDir, f);
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;
      const subagentsDir = path.join(fullPath, "subagents");
      if (!fs.existsSync(subagentsDir)) continue;
      const parentId = f;
      for (const agentFile of fs.readdirSync(subagentsDir)) {
        if (!agentFile.endsWith(".jsonl") || agentFile.endsWith(".lock") || agentFile.endsWith(".bak")) continue;
        sessionFileMeta.push({
          filePath: path.join(subagentsDir, agentFile),
          isSubagent: true,
          parentSessionId: parentId,
        });
      }
    }

    const uuidsWithSubagents = new Set(
      sessionFileMeta.filter(m => m.isSubagent).map(m => m.parentSessionId).filter(Boolean)
    );

    for (const meta of sessionFileMeta) {
      const { filePath, isSubagent, parentSessionId: parentId } = meta;
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

      const sessionId = path.basename(filePath, ".jsonl");
      const sessionKey = isSubagent
        ? sessionId
        : projectLabel;
      const hasSubagents = !isSubagent && uuidsWithSubagents.has(sessionId);

      sessions.push({
        sessionId,
        key: sessionKey,
        label: isSubagent
          ? "\u21b3 " + sessionId
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
        hasSubagents,
        compactionCount: 0,
        source: "claude",
        filePath,
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
      filePath,
    });
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── Kimi ──

export function listKimiSessions(): SessionInfo[] {
  const kimiDir = path.join(HOME, ".kimi", "sessions");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(kimiDir)) return sessions;

  try {
    for (const f of fs.readdirSync(kimiDir)) {
      const fullPath = path.join(kimiDir, f);
      if (!f.endsWith(".jsonl")) continue;
      try {
        const entries = parseJsonl(fullPath);
        let updatedAt = 0;
        try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

        let preview = "";
        let msgCount = 0;
        for (const e of entries) {
          if (e.type === "message" || e.type === "user" || e.type === "assistant") {
            msgCount++;
            const msg = (e.message || e) as Record<string, unknown>;
            const role = (msg.role as string) || e.type;
            if (role === "user" && !preview) {
              const content = msg.content;
              if (typeof content === "string") {
                preview = content.slice(0, 120);
              } else if (Array.isArray(content)) {
                for (const block of content as Record<string, unknown>[]) {
                  if (block.type === "text" && block.text) {
                    preview = (block.text as string).slice(0, 120);
                    break;
                  }
                }
              }
            }
          }
        }

        const sessionId = path.basename(f, ".jsonl");
        sessions.push({
          sessionId,
          key: sessionId,
          label: preview ? preview.slice(0, 60) : sessionId.slice(0, 14),
          lastUpdated: updatedAt,
          channel: "kimi",
          chatType: "direct",
          messageCount: msgCount,
          preview,
          isActive: true,
          isDeleted: false,
          isSubagent: false,
          compactionCount: 0,
          source: "kimi",
          filePath: fullPath,
        });
      } catch { /* skip bad files */ }
    }
  } catch { /* dir not readable */ }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── Gemini CLI ──

export function listGeminiSessions(): SessionInfo[] {
  const geminiDir = path.join(HOME, ".gemini", "tmp");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(geminiDir)) return sessions;

  function scanDir(dir: string) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".json")) {
          try {
            const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
            const messages = Array.isArray(raw) ? raw : (raw.messages || raw.history || []);
            if (!Array.isArray(messages) || messages.length === 0) return;

            let updatedAt = 0;
            try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

            let preview = "";
            let msgCount = 0;
            for (const m of messages as Record<string, unknown>[]) {
              const role = (m.role as string) || "";
              if (role === "user" || role === "model") msgCount++;
              if (role === "user" && !preview) {
                if (typeof m.content === "string") {
                  preview = (m.content as string).slice(0, 120);
                } else if (m.parts && Array.isArray(m.parts)) {
                  for (const p of m.parts as Record<string, unknown>[]) {
                    if (typeof p === "string") { preview = (p as unknown as string).slice(0, 120); break; }
                    if (p.text) { preview = (p.text as string).slice(0, 120); break; }
                  }
                }
              }
            }

            const sessionId = path.basename(entry.name, ".json");
            sessions.push({
              sessionId,
              key: sessionId,
              label: preview ? preview.slice(0, 60) : sessionId.slice(0, 14),
              lastUpdated: updatedAt,
              channel: "gemini",
              chatType: "direct",
              messageCount: msgCount,
              preview,
              isActive: true,
              isDeleted: false,
              isSubagent: false,
              compactionCount: 0,
              source: "gemini",
              filePath: fullPath,
            });
          } catch { /* skip bad files */ }
        }
      }
    } catch { /* ignore */ }
  }

  scanDir(geminiDir);
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── GitHub Copilot CLI ──

export function listCopilotSessions(): SessionInfo[] {
  const copilotDir = path.join(HOME, ".copilot", "session-state");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(copilotDir)) return sessions;

  function scanDir(dir: string) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl")) {
          try {
            let messages: Record<string, unknown>[] = [];
            if (entry.name.endsWith(".jsonl")) {
              messages = parseJsonl(fullPath) as unknown as Record<string, unknown>[];
            } else {
              const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
              messages = Array.isArray(raw) ? raw : (raw.messages || []);
            }
            if (messages.length === 0) return;

            let updatedAt = 0;
            try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

            let preview = "";
            let msgCount = 0;
            for (const m of messages) {
              const role = (m.role as string) || "";
              if (role === "user" || role === "assistant") msgCount++;
              if (role === "user" && !preview) {
                if (typeof m.content === "string") preview = (m.content as string).slice(0, 120);
              }
            }

            const sessionId = path.basename(entry.name).replace(/\.(json|jsonl)$/, "");
            sessions.push({
              sessionId,
              key: sessionId,
              label: preview ? preview.slice(0, 60) : sessionId.slice(0, 14),
              lastUpdated: updatedAt,
              channel: "copilot",
              chatType: "direct",
              messageCount: msgCount,
              preview,
              isActive: true,
              isDeleted: false,
              isSubagent: false,
              compactionCount: 0,
              source: "copilot",
              filePath: fullPath,
            });
          } catch { /* skip bad files */ }
        }
      }
    } catch { /* ignore */ }
  }

  scanDir(copilotDir);
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── Factory Droid ──

export function listFactorySessions(): SessionInfo[] {
  const dirs = [
    path.join(HOME, ".factory", "sessions"),
    path.join(HOME, ".factory", "projects"),
  ];
  const sessions: SessionInfo[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".jsonl") && !entry.name.endsWith(".lock") && !entry.name.endsWith(".bak")) {
          try {
            const entries = parseJsonl(fullPath);
            let updatedAt = 0;
            try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

            let preview = "";
            let msgCount = 0;
            for (const e of entries) {
              if (e.type === "user" || e.type === "assistant" || e.type === "message") {
                const msg = (e.message || e) as Record<string, unknown>;
                const role = (msg.role as string) || e.type;
                if (role === "user" || role === "assistant") msgCount++;
                if (role === "user" && !preview) {
                  const content = msg.content;
                  if (typeof content === "string") preview = content.slice(0, 120);
                  else if (Array.isArray(content)) {
                    for (const b of content as Record<string, unknown>[]) {
                      if ((b.type === "text" || b.type === "input_text") && b.text) {
                        preview = (b.text as string).slice(0, 120);
                        break;
                      }
                    }
                  }
                }
              }
            }

            const sessionId = path.basename(entry.name, ".jsonl");
            sessions.push({
              sessionId,
              key: sessionId,
              label: preview ? preview.slice(0, 60) : sessionId.slice(0, 14),
              lastUpdated: updatedAt,
              channel: "factory",
              chatType: "direct",
              messageCount: msgCount,
              preview,
              isActive: true,
              isDeleted: false,
              isSubagent: false,
              compactionCount: 0,
              source: "factory",
              filePath: fullPath,
            });
          } catch { /* skip bad files */ }
        }
      }
    } catch { /* ignore */ }
  }

  for (const d of dirs) scanDir(d);
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── OpenCode ──

export function listOpenCodeSessions(): SessionInfo[] {
  const ocDir = path.join(HOME, ".local", "share", "opencode", "storage", "session");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(ocDir)) return sessions;

  function scanDir(dir: string) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".json")) {
          try {
            const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
            const messages = raw.messages || [];
            if (!Array.isArray(messages) || messages.length === 0) return;

            let updatedAt = 0;
            try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

            const title = (raw.title as string) || "";
            let preview = "";
            let msgCount = 0;
            for (const m of messages as Record<string, unknown>[]) {
              const role = (m.role as string) || "";
              if (role === "user" || role === "assistant") msgCount++;
              if (role === "user" && !preview) {
                if (typeof m.content === "string") preview = (m.content as string).slice(0, 120);
              }
            }

            const sessionId = (raw.id as string) || path.basename(entry.name, ".json");
            sessions.push({
              sessionId,
              key: sessionId,
              title: title || undefined,
              label: title || (preview ? preview.slice(0, 60) : sessionId.slice(0, 14)),
              lastUpdated: updatedAt,
              channel: "opencode",
              chatType: "direct",
              messageCount: msgCount,
              preview,
              isActive: true,
              isDeleted: false,
              isSubagent: false,
              compactionCount: 0,
              source: "opencode",
              filePath: fullPath,
            });
          } catch { /* skip bad files */ }
        }
      }
    } catch { /* ignore */ }
  }

  scanDir(ocDir);
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── Aggregate all providers ──

export function getAllSessions(): SessionInfo[] {
  const all = [
    ...listKovaSessions(),
    ...listClaudeSessions(),
    ...listCodexSessions(),
    ...listKimiSessions(),
    ...listGeminiSessions(),
    ...listCopilotSessions(),
    ...listFactorySessions(),
    ...listOpenCodeSessions(),
  ];
  all.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return all;
}

// ── File path resolver ──

export function getSessionFilePath(
  sessionId: string,
  source: string
): string | null {
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
      } catch { /* ignore */ }
      return null;
    }
    return findJsonl(projectsDir);
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
          } else if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
            const entries = parseJsonl(fullPath);
            const meta = entries.find((e) => e.type === "session_meta");
            const payload = (meta?.payload as Record<string, unknown>) || {};
            if (payload.id === sessionId || path.basename(entry.name, ".jsonl") === sessionId) {
              return fullPath;
            }
          }
        }
      } catch { /* ignore */ }
      return null;
    }
    return findRollout(codexDir);
  }

  // For new providers, search all sessions by filePath
  if (["kimi", "gemini", "copilot", "factory", "opencode"].includes(source)) {
    const all = getAllSessions();
    const match = all.find(s => s.sessionId === sessionId && s.source === source);
    return match?.filePath || null;
  }

  // kova
  const files = findSessionFiles();
  const info = files[sessionId];
  return info ? info.path : null;
}

// ── Search ──

export function searchSessions(
  query: string,
  limit: number = 50
): { session: SessionInfo; snippet: string }[] {
  const q = query.toLowerCase();
  const allSessions = getAllSessions();
  const results: { session: SessionInfo; snippet: string }[] = [];

  for (const session of allSessions) {
    if (results.length >= limit) break;

    const titleMatch =
      (session.title || "").toLowerCase().includes(q) ||
      (session.label || "").toLowerCase().includes(q) ||
      (session.preview || "").toLowerCase().includes(q);

    if (titleMatch) {
      const matchField = (session.title || session.label || session.preview || "");
      const idx = matchField.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 30);
      const end = Math.min(matchField.length, idx + q.length + 50);
      const snippet = (start > 0 ? "\u2026" : "") + matchField.slice(start, end) + (end < matchField.length ? "\u2026" : "");
      results.push({ session, snippet });
      continue;
    }

    if (!session.filePath) continue;
    try {
      const data = fs.readFileSync(session.filePath, "utf-8");
      const lowerData = data.toLowerCase();
      const idx = lowerData.indexOf(q);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 40);
      const end = Math.min(data.length, idx + q.length + 60);
      let snippet = data.slice(start, end).replace(/\n/g, " ").replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim();
      if (start > 0) snippet = "\u2026" + snippet;
      if (end < data.length) snippet = snippet + "\u2026";
      results.push({ session, snippet: snippet.slice(0, 120) });
    } catch { /* ignore */ }
  }

  return results;
}

// ── Messages loader ──

export function getSessionMessages(
  sessionId: string,
  source: string
): RawEntry[] | null {
  // For JSON-based providers (gemini, opencode), convert to RawEntry format
  if (source === "gemini") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const messages = Array.isArray(raw) ? raw : (raw.messages || raw.history || []);
      return (messages as Record<string, unknown>[]).map((m) => {
        const role = (m.role as string) || "user";
        const content = typeof m.content === "string"
          ? m.content
          : m.parts
            ? (m.parts as Record<string, unknown>[]).map(p => typeof p === "string" ? p : (p.text || "")).join("\n")
            : "";
        return {
          type: role === "model" ? "assistant" : "user",
          timestamp: (m.timestamp as string) || undefined,
          message: { role: role === "model" ? "assistant" : "user", content },
        } as RawEntry;
      });
    } catch { return null; }
  }

  if (source === "opencode") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const messages = raw.messages || [];
      return (messages as Record<string, unknown>[]).map((m) => {
        const role = (m.role as string) || "user";
        const content = (m.content as string) || "";
        return {
          type: role,
          timestamp: (m.time as string) || (m.timestamp as string) || undefined,
          message: { role, content },
        } as RawEntry;
      });
    } catch { return null; }
  }

  if (source === "copilot") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    if (fp.endsWith(".jsonl")) return parseJsonl(fp);
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const messages = Array.isArray(raw) ? raw : (raw.messages || []);
      return (messages as Record<string, unknown>[]).map((m) => {
        const role = (m.role as string) || "user";
        const content = (m.content as string) || "";
        return {
          type: role,
          timestamp: (m.timestamp as string) || undefined,
          message: { role, content },
        } as RawEntry;
      });
    } catch { return null; }
  }

  // JSONL-based providers: kimi, factory, claude, codex, kova
  if (source === "kimi" || source === "factory") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    return parseJsonl(fp);
  }

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

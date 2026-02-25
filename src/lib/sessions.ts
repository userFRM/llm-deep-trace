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

// ── Preview cleaning ──────────────────────────────────────────────────────

/** Strip timestamp prefixes from OpenClaw session titles, e.g. [Thu 2026-02-19 16:02 GMT+1] */
function stripTimestampPrefix(s: string): string {
  return s
    // [Day YYYY-MM-DD HH:MM TZ] prefix
    .replace(/^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/i, "")
    // [media attached: ...] prefix
    .replace(/^\[media attached:[^\]]*\]\s*/i, "")
    // System: [...] prefix
    .replace(/^System:\s*\[[^\]]*\]\s*/i, "")
    .trim();
}

/** Strip internal XML payloads and noise from Claude session previews */
function cleanSessionPreview(raw: string): string {
  if (!raw) return "";

  // Strip timestamp prefix first
  const noTs = stripTimestampPrefix(raw);
  if (noTs !== raw) return noTs.slice(0, 120);

  // Looks like a raw session/tool ID (hex string) — skip entirely
  if (/^[0-9a-f]{8,}\s/.test(raw.trim()) || /^[0-9a-f]{32,}$/.test(raw.trim())) return "";

  // Extract task description from teammate-message
  const tm = raw.match(/<teammate-message[^>]+summary="([^"]{1,120})"/);
  if (tm) return tm[1];

  // Extract from task-notification body
  const tn = raw.match(/<task-notification[^>]*>\s*([\s\S]*?)\s*<\/task-notification>/);
  if (tn) {
    const inner = tn[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (inner.length > 6) return inner.slice(0, 120);
  }

  // Starts with XML — strip tags and use remainder
  if (raw.trimStart().startsWith("<")) {
    const stripped = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length > 6) return stripped.slice(0, 120);
    return "";
  }

  return raw.replace(/\n/g, " ").trim().slice(0, 120);
}

// ── Team resolution helpers ───────────────────────────────────────────────

interface TeamWindow { teamName: string; start: number; end: number }

/** Read parent JSONL and emit (teamName, timeRange) windows from top-level teamName fields */
function buildTeamWindows(filePath: string): TeamWindow[] {
  const windows: TeamWindow[] = [];
  let currentTeam: string | null = null;
  let currentStart = 0;
  let lastTs = 0;
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line) as Record<string, unknown>;
        const ts = d.timestamp ? new Date(d.timestamp as string).getTime() : 0;
        const tn = (d.teamName as string) || null;
        if (tn !== currentTeam) {
          if (currentTeam) windows.push({ teamName: currentTeam, start: currentStart, end: lastTs });
          currentTeam = tn;
          currentStart = ts;
        }
        if (ts) lastTs = ts;
      } catch { /* skip bad lines */ }
    }
    if (currentTeam) windows.push({ teamName: currentTeam, start: currentStart, end: lastTs });
  } catch { /* file unreadable */ }
  return windows.filter(w => !!w.teamName);
}

/** Find which team was active when a subagent (identified by its first-entry timestamp) was spawned */
function resolveTeamName(agentTs: number, windows: TeamWindow[]): string | undefined {
  if (!agentTs || !windows.length) return undefined;
  const SLACK = 90_000; // 90s — subagents start slightly after their parent's TeamCreate
  for (const w of windows) {
    if (agentTs >= w.start - SLACK && agentTs <= w.end + SLACK) return w.teamName;
  }
  // Fallback: closest window within 5 minutes
  let best: TeamWindow | undefined;
  let bestDist = Infinity;
  for (const w of windows) {
    const dist = Math.min(Math.abs(agentTs - w.start), Math.abs(agentTs - w.end));
    if (dist < bestDist) { bestDist = dist; best = w; }
  }
  return bestDist < 300_000 ? best?.teamName : undefined;
}

/** Extract a human label from a teammate-message XML payload */
function extractTeammateLabel(entries: RawEntry[]): string | undefined {
  for (const e of entries.slice(0, 4)) {
    const msg = (e.message || {}) as Record<string, unknown>;
    const content = msg.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? (content as Array<Record<string, unknown>>).map(b => b.text || "").join(" ")
        : "";
    const m = (text as string).match(/<teammate-message[^>]+summary="([^"]{1,80})"/);
    if (m) return m[1];
    // Also try parsing from XML-like pattern without quotes
    const m2 = (text as string).match(/<teammate-message[^>]+summary=([^>\s]{1,80})/);
    if (m2) return m2[1].replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

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

    // Pre-build team windows for every parent that has subagents
    const teamWindowsMap = new Map<string, TeamWindow[]>();
    for (const meta of sessionFileMeta) {
      if (!meta.isSubagent) {
        const sid = path.basename(meta.filePath, ".jsonl");
        if (uuidsWithSubagents.has(sid)) {
          teamWindowsMap.set(sid, buildTeamWindows(meta.filePath));
        }
      }
    }

    for (const meta of sessionFileMeta) {
      const { filePath, isSubagent, parentSessionId: parentId } = meta;
      const entries = parseJsonl(filePath);
      let updatedAt = 0;
      try {
        updatedAt = Math.floor(fs.statSync(filePath).mtimeMs);
      } catch {
        updatedAt = 0;
      }

      // Skip sessions with no real conversation (only internal snapshot/queue entries)
      const hasRealContent = entries.some(
        (e) => e.type === "user" || e.type === "assistant"
      );
      if (!hasRealContent) continue;

      // Extract cwd from the first entry that has it (gives us the actual repo path)
      let sessionCwd: string | undefined;
      for (const e of entries.slice(0, 10)) {
        const c = (e as Record<string, unknown>).cwd as string | undefined;
        if (c) { sessionCwd = c; break; }
      }

      // Extract startedAt — timestamp of first real user/assistant message
      let startedAt: number | undefined;
      for (const e of entries) {
        if (e.type === "user" || e.type === "assistant") {
          const ts = (e as Record<string, unknown>).timestamp as string | undefined;
          if (ts) { startedAt = new Date(ts).getTime(); break; }
        }
      }

      let rawPreview = "";
      let msgCount = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.type === "user" && !rawPreview) {
          const msg = (e.message || {}) as Record<string, unknown>;
          const content = msg.content;
          if (typeof content === "string") {
            rawPreview = content.slice(0, 300);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                ((block as Record<string, unknown>).type === "input_text" ||
                  (block as Record<string, unknown>).type === "text")
              ) {
                rawPreview = (
                  ((block as Record<string, unknown>).text as string) || ""
                ).slice(0, 300);
                break;
              }
            }
          }
        }
        if (e.type === "user" || e.type === "assistant") msgCount++;
      }

      // Clean XML/internal noise from preview
      const preview = cleanSessionPreview(rawPreview);

      const sessionId = path.basename(filePath, ".jsonl");
      const sessionKey = isSubagent ? sessionId : projectLabel;
      const hasSubagents = !isSubagent && uuidsWithSubagents.has(sessionId);

      // For subagents: resolve team, isSidechain, and a readable label
      let teamName: string | undefined;
      let isSidechain: boolean | undefined;
      let subagentLabel: string | undefined;

      if (isSubagent && entries.length > 0) {
        const firstEntry = entries[0] as Record<string, unknown>;
        isSidechain = firstEntry.isSidechain === true;

        if (isSidechain && parentId) {
          const windows = teamWindowsMap.get(parentId) || [];
          const firstTs = firstEntry.timestamp
            ? new Date(firstEntry.timestamp as string).getTime()
            : 0;
          teamName = resolveTeamName(firstTs, windows);
        }

        // Try to extract a human-readable task description
        subagentLabel = extractTeammateLabel(entries);
      }

      // Build the display label:
      // - Subagents: task summary or session ID
      // - Parents: clean first user message; fall back to cwd basename or project folder
      const cwdBasename = sessionCwd
        ? sessionCwd.split("/").filter(Boolean).pop() || ""
        : "";
      const label = isSubagent
        ? (subagentLabel || preview || sessionId)  // own first message as fallback
        : (preview || cwdBasename || projectLabel.split("/").pop() || sessionId.slice(0, 14));

      sessions.push({
        sessionId,
        key: sessionKey,
        label,
        lastUpdated: updatedAt,
        startedAt,
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
        cwd: sessionCwd,
        teamName,
        isSidechain,
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
  // Kimi structure: ~/.kimi/sessions/<project-hash>/<session-uuid>/context.jsonl
  const kimiDir = path.join(HOME, ".kimi", "sessions");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(kimiDir)) return sessions;

  try {
    for (const projectHash of fs.readdirSync(kimiDir)) {
      const projectDir = path.join(kimiDir, projectHash);
      try {
        if (!fs.statSync(projectDir).isDirectory()) continue;
      } catch { continue; }

      try {
        for (const sessionUuid of fs.readdirSync(projectDir)) {
          const sessionDir = path.join(projectDir, sessionUuid);
          try {
            if (!fs.statSync(sessionDir).isDirectory()) continue;
          } catch { continue; }

          const contextFile = path.join(sessionDir, "context.jsonl");
          if (!fs.existsSync(contextFile)) continue;

          try {
            const entries = parseJsonl(contextFile);
            let updatedAt = 0;
            try { updatedAt = Math.floor(fs.statSync(contextFile).mtimeMs); } catch { /* */ }

            let preview = "";
            let msgCount = 0;
            for (const e of entries) {
              const role = (e as Record<string, unknown>).role as string;
              if (!role || role.startsWith("_")) continue;
              msgCount++;
              if (role === "user" && !preview) {
                const content = (e as Record<string, unknown>).content;
                if (typeof content === "string" && content.trim()) {
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

            sessions.push({
              sessionId: sessionUuid,
              key: sessionUuid,
              label: preview ? preview.slice(0, 60) : sessionUuid.slice(0, 14),
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
              filePath: contextFile,
            });
          } catch { /* skip bad session */ }
        }
      } catch { /* skip unreadable project dir */ }
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

// ── Aider ──

export function listAiderSessions(): SessionInfo[] {
  const historyPath = path.join(HOME, ".aider.chat.history.md");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(historyPath)) {
    console.warn("Aider: 0 sessions found (no history file)");
    return sessions;
  }

  try {
    const data = fs.readFileSync(historyPath, "utf-8");
    let updatedAt = 0;
    try { updatedAt = Math.floor(fs.statSync(historyPath).mtimeMs); } catch { /* */ }

    // Split by "#### " lines which delimit user messages in aider history
    const userMsgs = data.split(/^#### /m).filter(Boolean);
    const msgCount = userMsgs.length;
    const preview = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].split("\n")[0].slice(0, 120) : "";

    sessions.push({
      sessionId: "aider-history",
      key: "aider-history",
      label: "aider chat history",
      lastUpdated: updatedAt,
      channel: "aider",
      chatType: "direct",
      messageCount: msgCount,
      preview,
      isActive: true,
      isDeleted: false,
      isSubagent: false,
      compactionCount: 0,
      source: "aider",
      filePath: historyPath,
    });
  } catch { /* skip */ }

  if (sessions.length === 0) console.warn("Aider: 0 sessions found");
  return sessions;
}

// ── Continue.dev ──

export function listContinueSessions(): SessionInfo[] {
  const continueDir = path.join(HOME, ".continue", "sessions");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(continueDir)) {
    console.warn("Continue.dev: 0 sessions found (directory missing)");
    return sessions;
  }

  try {
    for (const f of fs.readdirSync(continueDir)) {
      if (!f.endsWith(".json")) continue;
      const fullPath = path.join(continueDir, f);
      try {
        const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        const history = raw.history || raw.messages || [];
        let updatedAt = 0;
        try { updatedAt = Math.floor(fs.statSync(fullPath).mtimeMs); } catch { /* */ }

        let preview = "";
        let msgCount = 0;
        for (const m of history as Record<string, unknown>[]) {
          const role = (m.role as string) || "";
          if (role === "user" || role === "assistant") msgCount++;
          if (role === "user" && !preview) {
            if (typeof m.content === "string") preview = (m.content as string).slice(0, 120);
          }
        }

        const sessionId = path.basename(f, ".json");
        const title = (raw.title as string) || "";
        sessions.push({
          sessionId,
          key: sessionId,
          title: title || undefined,
          label: title || (preview ? preview.slice(0, 60) : sessionId.slice(0, 14)),
          lastUpdated: updatedAt,
          channel: "continue",
          chatType: "direct",
          messageCount: msgCount,
          preview,
          isActive: true,
          isDeleted: false,
          isSubagent: false,
          compactionCount: 0,
          source: "continue",
          filePath: fullPath,
        });
      } catch { /* skip bad files */ }
    }
  } catch { /* dir not readable */ }

  if (sessions.length === 0) console.warn("Continue.dev: 0 sessions found");
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return sessions;
}

// ── Cursor ──

export function listCursorSessions(): SessionInfo[] {
  const cursorDir = path.join(HOME, ".cursor-server");
  const sessions: SessionInfo[] = [];
  if (!fs.existsSync(cursorDir)) {
    console.warn("Cursor: 0 sessions found (directory missing)");
    return sessions;
  }

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
              messages = Array.isArray(raw) ? raw : (raw.messages || raw.history || []);
            }
            if (!Array.isArray(messages) || messages.length === 0) return;

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
              channel: "cursor",
              chatType: "direct",
              messageCount: msgCount,
              preview,
              isActive: true,
              isDeleted: false,
              isSubagent: false,
              compactionCount: 0,
              source: "cursor",
              filePath: fullPath,
            });
          } catch { /* skip bad files */ }
        }
      }
    } catch { /* ignore */ }
  }

  scanDir(cursorDir);
  if (sessions.length === 0) console.warn("Cursor: 0 sessions found");
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
    ...listAiderSessions(),
    ...listContinueSessions(),
    ...listCursorSessions(),
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
  if (["kimi", "gemini", "copilot", "factory", "opencode", "aider", "continue", "cursor"].includes(source)) {
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

  // Aider: markdown history file — convert to simple entries
  if (source === "aider") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    try {
      const data = fs.readFileSync(fp, "utf-8");
      const blocks = data.split(/^#### /m).filter(Boolean);
      const entries: RawEntry[] = [];
      for (const block of blocks) {
        const lines = block.split("\n");
        const userMsg = lines[0] || "";
        entries.push({
          type: "user",
          message: { role: "user", content: userMsg },
        });
        const rest = lines.slice(1).join("\n").trim();
        if (rest) {
          entries.push({
            type: "assistant",
            message: { role: "assistant", content: rest },
          });
        }
      }
      return entries;
    } catch { return null; }
  }

  // Continue.dev: JSON with history/messages array
  if (source === "continue") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const messages = raw.history || raw.messages || [];
      return (messages as Record<string, unknown>[]).map((m) => {
        const role = (m.role as string) || "user";
        const content = (m.content as string) || "";
        return {
          type: role,
          message: { role, content },
        } as RawEntry;
      });
    } catch { return null; }
  }

  // Cursor: JSON/JSONL files
  if (source === "cursor") {
    const fp = getSessionFilePath(sessionId, source);
    if (!fp) return null;
    if (fp.endsWith(".jsonl")) return parseJsonl(fp);
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const messages = Array.isArray(raw) ? raw : (raw.messages || raw.history || []);
      return (messages as Record<string, unknown>[]).map((m) => {
        const role = (m.role as string) || "user";
        const content = (m.content as string) || "";
        return {
          type: role,
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

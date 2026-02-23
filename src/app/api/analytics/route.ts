import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const HOME = os.homedir();

interface AnalyticsData {
  sessionsPerDay: { date: string; count: number; byProvider: Record<string, number> }[];
  messagesPerDay: { date: string; count: number; byProvider: Record<string, number> }[];
  providerBreakdown: { provider: string; count: number; sessions: number; messages: number; pct: number }[];
  topTools: { name: string; count: number }[];
  tokenTotals: { inputTokens: number; outputTokens: number; avgPerSession: number };
  sessionLengthDist: { bucket: string; count: number }[];
  totalSessions: number;
  totalMessages: number;
  avgSessionMessages: number;
  hourOfDay: number[][]; // [weekday 0-6][hour 0-23]
}

function scanJsonlForAnalytics(
  filePath: string,
  source: string,
  acc: {
    dates: Map<string, number>;
    providers: Map<string, number>;
    tools: Map<string, number>;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
    msgCounts: number[];
  }
) {
  let msgCount = 0;
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    for (const line of data.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);

        // Count messages
        if (
          entry.type === "message" ||
          entry.type === "user" ||
          entry.type === "assistant"
        ) {
          msgCount++;
        }
        if (entry.type === "response_item") {
          msgCount++;
        }

        // Tool usage (Claude Code JSONL format)
        if (source === "claude") {
          if (
            entry.type === "assistant" &&
            entry.message &&
            Array.isArray(entry.message.content)
          ) {
            for (const block of entry.message.content) {
              if (block && block.type === "tool_use" && block.name) {
                const name = block.name as string;
                acc.tools.set(name, (acc.tools.get(name) || 0) + 1);
              }
            }
          }
        }

        // Token usage from usage fields
        if (entry.usage) {
          const u = entry.usage;
          if (u.input_tokens) acc.inputTokens += u.input_tokens;
          if (u.output_tokens) acc.outputTokens += u.output_tokens;
        }
        // Claude Code also nests usage in message
        if (entry.message?.usage) {
          const u = entry.message.usage;
          if (u.input_tokens) acc.inputTokens += u.input_tokens;
          if (u.output_tokens) acc.outputTokens += u.output_tokens;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // file not readable
  }
  acc.msgCounts.push(msgCount);
}

function getFileDate(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const d = new Date(stat.mtimeMs);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "30d";
  const agentFilter = searchParams.get("agent") || "all";

  const cutoffDate = (() => {
    if (period === "all") return null;
    const d = new Date();
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  })();

  const acc = {
    dates: new Map<string, number>(),
    datesByProvider: new Map<string, Map<string, number>>(),
    msgsByDate: new Map<string, number>(),
    msgsByDateByProvider: new Map<string, Map<string, number>>(),
    providers: new Map<string, number>(),
    providerMessages: new Map<string, number>(),
    tools: new Map<string, number>(),
    inputTokens: 0,
    outputTokens: 0,
    sessionCount: 0,
    msgCounts: [] as number[],
    // [weekday 0-6 Sun-Sat][hour 0-23]
    hourOfDay: Array.from({ length: 7 }, () => new Array(24).fill(0)) as number[][],
  };

  function processFile(filePath: string, source: string) {
    if (agentFilter !== "all" && source !== agentFilter) return;
    const date = getFileDate(filePath);
    const inPeriod = !cutoffDate || (date && date >= cutoffDate);
    if (inPeriod && date) {
      acc.dates.set(date, (acc.dates.get(date) || 0) + 1);
      if (!acc.datesByProvider.has(source)) acc.datesByProvider.set(source, new Map());
      acc.datesByProvider.get(source)!.set(date, (acc.datesByProvider.get(source)!.get(date) || 0) + 1);
    }
    // Track hour of day from file mtime
    try {
      const mtime = new Date(fs.statSync(filePath).mtimeMs);
      const weekday = mtime.getDay();
      const hour = mtime.getHours();
      acc.hourOfDay[weekday][hour]++;
    } catch { /* ignore */ }

    acc.providers.set(source, (acc.providers.get(source) || 0) + 1);
    acc.sessionCount++;
    const prevMsgTotal = acc.msgCounts.reduce((s, v) => s + v, 0);
    scanJsonlForAnalytics(filePath, source, acc);
    const addedMsgs = acc.msgCounts.reduce((s, v) => s + v, 0) - prevMsgTotal;
    if (inPeriod && date && addedMsgs > 0) {
      acc.msgsByDate.set(date, (acc.msgsByDate.get(date) || 0) + addedMsgs);
      if (!acc.msgsByDateByProvider.has(source)) acc.msgsByDateByProvider.set(source, new Map());
      acc.msgsByDateByProvider.get(source)!.set(date, (acc.msgsByDateByProvider.get(source)!.get(date) || 0) + addedMsgs);
    }
    acc.providerMessages.set(source, (acc.providerMessages.get(source) || 0) + addedMsgs);
  }

  // Scan OpenClaw/Kova sessions
  const kovaDir = path.join(HOME, ".openclaw", "agents", "main", "sessions");
  if (fs.existsSync(kovaDir)) {
    try {
      for (const f of fs.readdirSync(kovaDir)) {
        if (!f.endsWith(".jsonl") || f.endsWith(".lock") || f.endsWith(".bak")) continue;
        processFile(path.join(kovaDir, f), "kova");
      }
    } catch { /* */ }
  }

  // Scan Claude Code sessions
  const claudeDir = path.join(HOME, ".claude", "projects");
  if (fs.existsSync(claudeDir)) {
    try {
      function scanClaude(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanClaude(fullPath);
          } else if (entry.name.endsWith(".jsonl") && !entry.name.endsWith(".lock") && !entry.name.endsWith(".bak")) {
            processFile(fullPath, "claude");
          }
        }
      }
      scanClaude(claudeDir);
    } catch { /* */ }
  }

  // Scan Codex sessions
  const codexDir = path.join(HOME, ".codex", "sessions");
  if (fs.existsSync(codexDir)) {
    try {
      function scanCodex(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanCodex(fullPath);
          } else if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
            processFile(fullPath, "codex");
          }
        }
      }
      scanCodex(codexDir);
    } catch { /* */ }
  }

  // Scan Kimi sessions
  const kimiDir = path.join(HOME, ".kimi", "sessions");
  if (fs.existsSync(kimiDir)) {
    try {
      for (const f of fs.readdirSync(kimiDir)) {
        if (!f.endsWith(".jsonl")) continue;
        processFile(path.join(kimiDir, f), "kimi");
      }
    } catch { /* */ }
  }

  // Scan Gemini sessions
  const geminiDir = path.join(HOME, ".gemini", "tmp");
  if (fs.existsSync(geminiDir)) {
    try {
      function scanGemini(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) scanGemini(fullPath);
          else if (entry.name.endsWith(".json")) {
            const date = getFileDate(fullPath);
            if (date && (!cutoffDate || date >= cutoffDate)) {
              acc.dates.set(date, (acc.dates.get(date) || 0) + 1);
            }
            acc.providers.set("gemini", (acc.providers.get("gemini") || 0) + 1);
            acc.sessionCount++;
            acc.msgCounts.push(0);
          }
        }
      }
      scanGemini(geminiDir);
    } catch { /* */ }
  }

  // Scan Aider sessions
  const aiderHistory = path.join(HOME, ".aider.chat.history.md");
  if (fs.existsSync(aiderHistory)) {
    const date = getFileDate(aiderHistory);
    if (date && (!cutoffDate || date >= cutoffDate)) {
      acc.dates.set(date, (acc.dates.get(date) || 0) + 1);
    }
    acc.providers.set("aider", (acc.providers.get("aider") || 0) + 1);
    acc.sessionCount++;
    acc.msgCounts.push(0);
  }

  // Scan Continue.dev sessions
  const continueDir = path.join(HOME, ".continue", "sessions");
  if (fs.existsSync(continueDir)) {
    try {
      for (const f of fs.readdirSync(continueDir)) {
        if (!f.endsWith(".json")) continue;
        const fullPath = path.join(continueDir, f);
        const date = getFileDate(fullPath);
        if (date && (!cutoffDate || date >= cutoffDate)) {
          acc.dates.set(date, (acc.dates.get(date) || 0) + 1);
        }
        acc.providers.set("continue", (acc.providers.get("continue") || 0) + 1);
        acc.sessionCount++;
        acc.msgCounts.push(0);
      }
    } catch { /* */ }
  }

  // Scan Cursor sessions
  const cursorDir = path.join(HOME, ".cursor-server");
  if (fs.existsSync(cursorDir)) {
    try {
      function scanCursor(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) scanCursor(fullPath);
          else if (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl")) {
            const date = getFileDate(fullPath);
            if (date && (!cutoffDate || date >= cutoffDate)) {
              acc.dates.set(date, (acc.dates.get(date) || 0) + 1);
            }
            acc.providers.set("cursor", (acc.providers.get("cursor") || 0) + 1);
            acc.sessionCount++;
            acc.msgCounts.push(0);
          }
        }
      }
      scanCursor(cursorDir);
    } catch { /* */ }
  }

  // Build sessions per day + messages per day
  const allProviders = Array.from(acc.providers.keys());
  const sessionsPerDay: { date: string; count: number; byProvider: Record<string, number> }[] = [];
  const messagesPerDay: { date: string; count: number; byProvider: Record<string, number> }[] = [];
  const now = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? 90 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const byProvider: Record<string, number> = {};
    const msgByProvider: Record<string, number> = {};
    for (const p of allProviders) {
      byProvider[p] = acc.datesByProvider.get(p)?.get(key) || 0;
      msgByProvider[p] = acc.msgsByDateByProvider.get(p)?.get(key) || 0;
    }
    sessionsPerDay.push({ date: key, count: acc.dates.get(key) || 0, byProvider });
    messagesPerDay.push({ date: key, count: acc.msgsByDate.get(key) || 0, byProvider: msgByProvider });
  }

  // Provider breakdown
  const totalProviderSessions = Array.from(acc.providers.values()).reduce((a, b) => a + b, 0) || 1;
  const totalProviderMessages = Array.from(acc.providerMessages.values()).reduce((a, b) => a + b, 0) || 1;
  const providerBreakdown = Array.from(acc.providers.entries())
    .map(([provider, count]) => ({
      provider,
      count,
      sessions: count,
      messages: acc.providerMessages.get(provider) || 0,
      pct: Math.round((count / totalProviderSessions) * 100),
    }))
    .sort((a, b) => b.count - a.count);
  void totalProviderMessages;

  // Top 10 tools
  const topTools = Array.from(acc.tools.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Token totals
  const tokenTotals = {
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    avgPerSession: acc.sessionCount > 0
      ? Math.round((acc.inputTokens + acc.outputTokens) / acc.sessionCount)
      : 0,
  };

  // Session length distribution
  const buckets = { "1-5": 0, "6-20": 0, "21-50": 0, "51-100": 0, "100+": 0 };
  for (const count of acc.msgCounts) {
    if (count <= 5) buckets["1-5"]++;
    else if (count <= 20) buckets["6-20"]++;
    else if (count <= 50) buckets["21-50"]++;
    else if (count <= 100) buckets["51-100"]++;
    else buckets["100+"]++;
  }
  const sessionLengthDist = Object.entries(buckets).map(([bucket, count]) => ({
    bucket,
    count,
  }));

  const totalMessages = acc.msgCounts.reduce((s, v) => s + v, 0);
  const avgSessionMessages = acc.msgCounts.length > 0
    ? Math.round(totalMessages / acc.msgCounts.length) : 0;

  const result: AnalyticsData = {
    sessionsPerDay,
    messagesPerDay,
    providerBreakdown,
    topTools,
    tokenTotals,
    sessionLengthDist,
    totalSessions: acc.sessionCount,
    totalMessages,
    avgSessionMessages,
    hourOfDay: acc.hourOfDay,
  };

  return NextResponse.json(result);
}

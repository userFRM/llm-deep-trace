import { NormalizedMessage, RawEntry } from "./types";

export function normalizeClaudeEntry(
  e: RawEntry
): NormalizedMessage | NormalizedMessage[] | null {
  const skip = new Set([
    "progress",
    "queue-operation",
    "system",
    "result",
    "debug",
    "error_json",
  ]);
  if (skip.has(e.type)) return null;

  if (e.type === "user" || e.type === "assistant") {
    const msg = (e.message || {}) as Record<string, unknown>;
    const role = (msg.role as string) || e.type;
    const content = msg.content;
    const nc: Record<string, unknown>[] = [];
    const toolResults: NormalizedMessage[] = [];

    if (typeof content === "string") {
      nc.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        const block = b as Record<string, unknown>;
        if (block.type === "text") nc.push(block);
        else if (block.type === "thinking") nc.push(block);
        else if (block.type === "tool_use") nc.push(block);
        else if (block.type === "tool_result") {
          const rc = Array.isArray(block.content)
            ? block.content
            : [{ type: "text", text: String(block.content || "") }];
          toolResults.push({
            type: "message",
            timestamp: e.timestamp,
            message: {
              role: "toolResult",
              toolCallId: block.tool_use_id as string,
              toolName: "",
              content: rc,
              isError: block.is_error as boolean,
            },
          });
        } else if (block.type === "input_text") {
          nc.push({ type: "text", text: block.text || "" });
        } else if (block.type === "output_text") {
          nc.push({ type: "text", text: block.text || "" });
        }
      }
    }

    const teamMeta: Partial<NormalizedMessage> = {};
    if (e.teamName) teamMeta.teamName = e.teamName as string;
    if (e.isSidechain) teamMeta.isSidechain = e.isSidechain as boolean;

    if (toolResults.length > 0) {
      const out: NormalizedMessage[] = [];
      if (nc.length)
        out.push({
          type: "message",
          timestamp: e.timestamp,
          message: { role, content: nc as unknown as string },
          ...teamMeta,
        });
      out.push(...toolResults.map(r => ({ ...r, ...teamMeta })));
      return out.length === 1 ? out[0] : out;
    }
    return {
      type: "message",
      timestamp: e.timestamp,
      message: {
        role,
        content: nc.length ? (nc as unknown as string) : (content as string),
      },
      ...teamMeta,
    };
  }
  return null;
}

export function normalizeCodexEntry(e: RawEntry): NormalizedMessage | null {
  const skip = new Set(["event_msg", "session_meta", "turn_context"]);
  if (skip.has(e.type)) return null;

  if (e.type === "response_item") {
    const p = (e.payload || {}) as Record<string, unknown>;
    const ptype = (p.type as string) || "message";
    const ts = e.timestamp;

    if (ptype === "message") {
      const role = p.role as string;
      if (role === "developer") return null;
      const rawContent = (p.content || []) as Record<string, unknown>[];
      const content = rawContent.map(
        (b: Record<string, unknown>) => {
          if (b.type === "input_text") return { type: "text", text: b.text || "" };
          if (b.type === "output_text") return { type: "text", text: b.text || "" };
          if (b.type === "text") return b;
          if (b.type === "refusal")
            return { type: "text", text: "[refusal: " + (b.refusal || "") + "]" };
          return { type: "text", text: JSON.stringify(b) };
        }
      );
      return {
        type: "message",
        timestamp: ts,
        message: {
          role: role === "assistant" ? "assistant" : "user",
          content: content as unknown as string,
        },
      };
    }

    if (ptype === "function_call") {
      let input: Record<string, unknown> = {};
      if (p.arguments) {
        try {
          input = JSON.parse(p.arguments as string);
        } catch {
          input = { raw: p.arguments };
        }
      }
      return {
        type: "message",
        timestamp: ts,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: (p.call_id as string) || (p.id as string),
              name: (p.name as string) || "function",
              input,
            },
          ] as unknown as string,
        },
      };
    }

    if (ptype === "function_call_output") {
      return {
        type: "message",
        timestamp: ts,
        message: {
          role: "toolResult",
          toolCallId: p.call_id as string,
          toolName: "",
          content: [{ type: "text", text: (p.output as string) || "" }] as unknown as string,
        },
      };
    }

    if (ptype === "reasoning" && p.summary) {
      const summaryArr = p.summary as { text?: string }[];
      const text = summaryArr.map((s) => s.text || "").join("\n");
      return {
        type: "message",
        timestamp: ts,
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: text }] as unknown as string,
        },
      };
    }
  }
  return null;
}

/** Normalize Kimi content: string | array of {type: "think"|"text", text} */
export function normalizeKimiEntry(e: RawEntry): NormalizedMessage | null {
  const msg = (e.message || e) as Record<string, unknown>;
  const role = (msg.role as string) || e.type;
  if (role !== "user" && role !== "assistant") return null;

  const content = msg.content;
  const nc: Record<string, unknown>[] = [];

  if (typeof content === "string") {
    nc.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content as Record<string, unknown>[]) {
      if (!block) continue;
      if (block.type === "think" && block.text) {
        nc.push({ type: "thinking", thinking: block.text });
      } else if (block.type === "text" && block.text) {
        nc.push({ type: "text", text: block.text });
      } else if (typeof block === "string") {
        nc.push({ type: "text", text: block });
      } else if (block.text) {
        nc.push({ type: "text", text: block.text });
      }
    }
  }

  if (nc.length === 0) return null;

  return {
    type: "message",
    timestamp: e.timestamp,
    message: {
      role,
      content: nc as unknown as string,
    },
  };
}

/** Normalize Kimi context.jsonl entries — direct {role, content} with no `type` wrapper */
export function normalizeKimiDirectEntry(e: RawEntry): NormalizedMessage | null {
  const raw = e as unknown as Record<string, unknown>;
  const role = raw.role as string;
  // Skip internal entries
  if (!role || role.startsWith("_")) return null;
  if (role !== "user" && role !== "assistant") return null;

  const content = raw.content;
  const nc: Record<string, unknown>[] = [];

  if (typeof content === "string") {
    if (content.trim()) nc.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content as Record<string, unknown>[]) {
      if (!block) continue;
      // Kimi think block: {type:"think", think:"...", encrypted:null}
      if (block.type === "think" && block.think) {
        nc.push({ type: "thinking", thinking: block.think });
      } else if (block.type === "text" && block.text) {
        nc.push({ type: "text", text: block.text });
      } else if (typeof (block as unknown) === "string" && (block as unknown as string).trim()) {
        nc.push({ type: "text", text: block as unknown as string });
      }
    }
  }

  if (nc.length === 0) return null;

  return {
    type: "message",
    timestamp: (raw.timestamp as string) || undefined,
    message: {
      role,
      content: nc as unknown as string,
    },
  };
}

/** Normalize simple message entries (gemini, opencode, copilot, factory) */
export function normalizeSimpleEntry(e: RawEntry): NormalizedMessage | null {
  const msg = (e.message || e) as Record<string, unknown>;
  const role = (msg.role as string) || e.type;
  if (role !== "user" && role !== "assistant" && role !== "model") return null;

  const normalizedRole = role === "model" ? "assistant" : role;
  const content = msg.content;

  if (typeof content === "string") {
    return {
      type: "message",
      timestamp: e.timestamp,
      message: {
        role: normalizedRole,
        content: [{ type: "text", text: content }] as unknown as string,
      },
    };
  }

  if (Array.isArray(content)) {
    const nc = (content as Record<string, unknown>[]).map(b => {
      if (b.type === "text") return b;
      if (typeof b === "string") return { type: "text", text: b };
      if (b.text) return { type: "text", text: b.text };
      return { type: "text", text: JSON.stringify(b) };
    });
    return {
      type: "message",
      timestamp: e.timestamp,
      message: {
        role: normalizedRole,
        content: nc as unknown as string,
      },
    };
  }

  return null;
}

export function normalizeEntries(entries: RawEntry[]): NormalizedMessage[] {
  const toolNameMap = new Map<string, string>();
  const normalized: NormalizedMessage[] = [];

  // Detect provider from first entry patterns
  let detectedProvider = "";
  for (const e of entries) {
    if (e.type === "response_item" || e.type === "session_meta") { detectedProvider = "codex"; break; }
    if (e.type === "user" || e.type === "assistant") {
      const msg = (e.message || {}) as Record<string, unknown>;
      if (msg.role && Array.isArray(msg.content)) {
        const first = (msg.content as Record<string, unknown>[])[0];
        if (first && (first.type === "think" || first.type === "text")) {
          detectedProvider = "kimi";
        }
      }
      if (!detectedProvider) detectedProvider = "claude";
      break;
    }
    if (e.type === "message") {
      const msg = (e.message || e) as Record<string, unknown>;
      if (typeof msg.content === "string" && (msg.role === "user" || msg.role === "assistant" || msg.role === "model")) {
        detectedProvider = "simple";
        break;
      }
    }
    // Kimi context.jsonl: direct {role, content} with no `type` field
    if (!e.type) {
      const role = (e as unknown as Record<string, unknown>).role as string;
      if (role === "user" || role === "assistant") {
        detectedProvider = "kimi-direct";
        break;
      }
    }
  }

  for (const e of entries) {
    const t = e.type;
    let norm: NormalizedMessage | NormalizedMessage[] | null = null;

    if (detectedProvider === "kimi-direct") {
      norm = normalizeKimiDirectEntry(e);
    } else if (detectedProvider === "kimi" && (t === "user" || t === "assistant" || t === "message")) {
      norm = normalizeKimiEntry(e);
    } else if (detectedProvider === "simple" && (t === "user" || t === "assistant" || t === "message" || t === "model")) {
      norm = normalizeSimpleEntry(e);
    } else if (
      ["user", "assistant", "progress", "queue-operation", "system", "result", "debug"].includes(t)
    ) {
      norm = normalizeClaudeEntry(e);
    } else if (
      ["response_item", "event_msg", "session_meta", "turn_context"].includes(t)
    ) {
      norm = normalizeCodexEntry(e);
    } else {
      norm = e as unknown as NormalizedMessage;
    }

    if (!norm) continue;

    const normList = Array.isArray(norm) ? norm : [norm];
    for (const n of normList) {
      normalized.push(n);
      const msg = n.message;
      if (msg && msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const b of msg.content as unknown as Record<string, unknown>[]) {
          if (
            b.id &&
            b.name &&
            (b.type === "tool_use" || b.type === "toolCall")
          ) {
            toolNameMap.set(b.id as string, b.name as string);
          }
        }
      }
    }
  }

  // Backfill tool names
  for (const norm of normalized) {
    const msg = norm.message;
    if (msg && msg.role === "toolResult" && !msg.toolName && msg.toolCallId) {
      const name = toolNameMap.get(msg.toolCallId);
      if (name) msg.toolName = name;
    }
  }

  return normalized;
}

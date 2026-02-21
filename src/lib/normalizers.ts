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
    let content = msg.content;
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

    if (toolResults.length > 0) {
      const out: NormalizedMessage[] = [];
      if (nc.length)
        out.push({
          type: "message",
          timestamp: e.timestamp,
          message: { role, content: nc as unknown as string },
        });
      out.push(...toolResults);
      return out.length === 1 ? out[0] : out;
    }
    return {
      type: "message",
      timestamp: e.timestamp,
      message: {
        role,
        content: nc.length ? (nc as unknown as string) : (content as string),
      },
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

export function normalizeEntries(entries: RawEntry[]): NormalizedMessage[] {
  const toolNameMap = new Map<string, string>();
  const normalized: NormalizedMessage[] = [];

  for (const e of entries) {
    const t = e.type;
    let norm: NormalizedMessage | NormalizedMessage[] | null = null;

    if (
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

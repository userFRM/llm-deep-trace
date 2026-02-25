"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useStore, BlockCategory, PinnedBlock } from "@/lib/store";
import { BlockColors, NormalizedMessage, SessionInfo } from "@/lib/types";
import { sessionLabel, relativeTime, channelIcon, copyToClipboard, extractText, extractResultText } from "@/lib/client-utils";
import MessageRenderer from "./MessageRenderer";

function MsgSearchBar({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Element[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    messagesEl.current = document.getElementById("messages-container");
  }, []);

  const clearHighlights = useCallback(() => {
    const el = messagesEl.current;
    if (!el) return;
    el.querySelectorAll("mark.search-hl").forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
      }
    });
  }, []);

  const doSearch = useCallback(() => {
    clearHighlights();
    const el = messagesEl.current;
    if (!el || !query.trim()) {
      setMatches([]);
      setCurrentIdx(-1);
      return;
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const newMatches: Element[] = [];

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodesToProcess: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest("script,button")) continue;
      if (regex.test(node.textContent || "")) nodesToProcess.push(node);
      regex.lastIndex = 0;
    }

    for (const node of nodesToProcess) {
      const parent = node.parentNode;
      if (!parent) continue;
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match;
      regex.lastIndex = 0;
      const text = node.textContent || "";
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        const mark = document.createElement("mark");
        mark.className = "search-hl";
        mark.textContent = match[0];
        newMatches.push(mark);
        frag.appendChild(mark);
        lastIdx = regex.lastIndex;
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      parent.replaceChild(frag, node);
    }

    setMatches(newMatches);
    if (newMatches.length > 0) {
      setCurrentIdx(0);
      newMatches[0].classList.add("current");
      newMatches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setCurrentIdx(-1);
    }
  }, [query, clearHighlights]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 200);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const navigate = useCallback(
    (dir: number) => {
      if (!matches.length) return;
      matches.forEach((m) => m.classList.remove("current"));
      const newIdx = (currentIdx + dir + matches.length) % matches.length;
      setCurrentIdx(newIdx);
      matches[newIdx].classList.add("current");
      matches[newIdx].scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [matches, currentIdx]
  );

  const handleClose = useCallback(() => {
    clearHighlights();
    setQuery("");
    setMatches([]);
    setCurrentIdx(-1);
    onClose();
  }, [clearHighlights, onClose]);

  if (!visible) return null;

  return (
    <div className="msg-search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search in session…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.shiftKey ? navigate(-1) : navigate(1); e.preventDefault(); }
          if (e.key === "Escape") { handleClose(); e.preventDefault(); }
        }}
        className="msg-search-input"
        autoFocus
      />
      <span className="msg-search-count">
        {currentIdx >= 0 ? currentIdx + 1 : 0} / {matches.length}
      </span>
      <button onClick={() => navigate(-1)} title="Previous (Shift+Enter)" className="msg-search-btn">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button onClick={() => navigate(1)} title="Next (Enter)" className="msg-search-btn">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button onClick={handleClose} title="Close (Esc)" className="msg-search-btn">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

const BLOCK_PILLS: { category: BlockCategory; label: string }[] = [
  { category: "user-msg", label: "user" },
  { category: "asst-text", label: "assistant" },
  { category: "thinking", label: "thinking" },
  { category: "exec", label: "exec" },
  { category: "file", label: "edit / write" },
  { category: "web", label: "web" },
  { category: "browser", label: "browser" },
  { category: "msg", label: "message" },
  { category: "agent", label: "tasks" },
];

// Three states per block type: "collapsed" | "expanded" | "hidden"
// Click cycles: collapsed → expanded → hidden → collapsed
function BlockToggleToolbar({
  blockExpansion,
  blockColors,
  onToggle,
  hiddenBlockTypes,
  onToggleHidden,
}: {
  blockExpansion: Record<string, boolean>;
  blockColors: BlockColors;
  onToggle: (category: BlockCategory) => void;
  hiddenBlockTypes: Set<BlockCategory>;
  onToggleHidden: (category: BlockCategory) => void;
}) {
  const handleCycle = (category: BlockCategory) => {
    // conversation-turn categories: two-state (visible ↔ hidden)
    if (category === "user-msg" || category === "asst-text") {
      onToggleHidden(category);
      return;
    }
    const hidden = hiddenBlockTypes.has(category);
    const expanded = blockExpansion[category];
    if (hidden) {
      // hidden → collapsed (make visible, ensure collapsed)
      onToggleHidden(category);
      if (expanded) onToggle(category); // force collapsed
    } else if (!expanded) {
      // collapsed → expanded
      onToggle(category);
    } else {
      // expanded → hidden
      onToggle(category); // collapse first
      onToggleHidden(category); // then hide
    }
  };

  return (
    <div className="block-toggle-strip">
      <span className="block-strip-label">blocks</span>
      {BLOCK_PILLS.map(({ category, label }, pillIdx) => {
        // Visual separator between conversation pills and tool block pills
        const separator = pillIdx === 2 ? <span key="sep" className="block-pill-sep" /> : null;
        const hidden = hiddenBlockTypes.has(category);
        const expanded = !hidden && blockExpansion[category];
        const color = blockColors[category] || "#888899";
        // state: "hidden" | "collapsed" | "expanded"
        const state = hidden ? "hidden" : expanded ? "expanded" : "collapsed";
        const isTwoState = category === "user-msg" || category === "asst-text";
        const titles = isTwoState ? {
          collapsed: `${label} — visible. Click to hide.`,
          expanded:  `${label} — visible. Click to hide.`,
          hidden:    `${label} — hidden. Click to show.`,
        } : {
          collapsed: `${label} — visible, collapsed. Click to expand.`,
          expanded:  `${label} — visible, expanded. Click to hide.`,
          hidden:    `${label} — hidden. Click to show.`,
        };
        return (
          <React.Fragment key={category}>
            {separator}
          <button
            className={`block-pill block-pill-tri state-${state}`}
            style={
              state === "expanded"
                ? { background: color, borderColor: color, color: "#fff" }
                : state === "collapsed"
                ? { borderColor: color, color }
                : { borderColor: "var(--border)", color: "var(--text-3)" }
            }
            title={titles[state]}
            onClick={() => handleCycle(category)}
          >
            {state === "hidden" && (
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" style={{ marginRight: 3, opacity: 0.5 }}>
                <path d="M2 2l12 12M6.5 3.5C7 3.2 7.5 3 8 3c4 0 6 5 6 5s-.7 1.4-2 2.8M4.2 4.7C2.8 6.1 2 8 2 8s2 5 6 5c1.4 0 2.6-.5 3.5-1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
            <span style={state === "hidden" ? { opacity: 0.45 } : undefined}>{label}</span>
          </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Pinned Blocks Strip ──
const BLOCK_TYPE_COLORS: Record<string, string> = {
  thinking: "#71717A",
  exec: "#22C55E",
  file: "#3B82F6",
  web: "#8B5CF6",
  browser: "#06B6D4",
  msg: "#F59E0B",
  agent: "#9B72EF",
  "user-msg": "#9B72EF",
  "asst-text": "#E8E8F0",
};

function PinnedStrip({ blocks, onUnpin, onScrollTo }: {
  blocks: PinnedBlock[];
  onUnpin: (blockId: string) => void;
  onScrollTo: (msgIndex: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const sorted = [...blocks].sort((a, b) => a.msgIndex - b.msgIndex);
  return (
    <div className="pinned-strip">
      <div className="pinned-strip-header" onClick={() => setOpen(!open)}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}>
          <path d="M5 17H19V13L17 5H7L5 13V17Z" fill="#9B72EF" stroke="#9B72EF" strokeWidth="0.8" strokeLinejoin="round"/>
          <line x1="5" y1="9" x2="19" y2="9" stroke="#7B52CF" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="12" y1="17" x2="12" y2="22" stroke="#9B72EF" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <span>{sorted.length} pinned</span>
        <span className="pinned-strip-chevron">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="pinned-strip-items">
          {sorted.map((block) => {
            const color = BLOCK_TYPE_COLORS[block.blockType] || "#888";
            return (
              <div key={block.blockId} className="pinned-strip-item" onClick={() => onScrollTo(block.msgIndex)}>
                <span className="pinned-block-badge" style={{ background: color }} title={block.blockType}/>
                <span className="pinned-preview">{block.preview || block.blockType}</span>
                <button className="pinned-unpin" title="Unpin" onClick={(e) => { e.stopPropagation(); onUnpin(block.blockId); }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Export helpers ──
function entryToMarkdown(entry: NormalizedMessage, hiddenBlockTypes: Set<BlockCategory>): string {
  const msg = entry.message;
  if (!msg) return "";
  const role = msg.role;
  const content = msg.content;

  if (role === "user") {
    if (hiddenBlockTypes.has("user-msg")) return "";
    const text = typeof content === "string" ? content
      : Array.isArray(content) ? (content as unknown as Record<string, unknown>[])
          .filter(b => b.type === "text").map(b => b.text as string).join("\n")
      : "";
    return `**User**\n\n${text}\n\n`;
  }

  if (role === "assistant") {
    const lines: string[] = [];
    if (Array.isArray(content)) {
      for (const block of content as unknown as Record<string, unknown>[]) {
        if (block.type === "thinking" && block.thinking) {
          if (!hiddenBlockTypes.has("thinking")) {
            lines.push(`> *thinking*\n>\n> ${String(block.thinking).replace(/\n/g, "\n> ")}\n`);
          }
        } else if (block.type === "text" && block.text) {
          if (!hiddenBlockTypes.has("asst-text")) lines.push(String(block.text));
        } else if (block.type === "tool_use" || block.type === "toolCall") {
          const catKey = (() => {
            const name = (block.name as string) || "";
            if (/bash|exec|run_command/i.test(name)) return "exec";
            if (/read|write|edit|str_replace|create_file/i.test(name)) return "file";
            if (/web_search|brave|search/i.test(name)) return "web";
            if (/web_fetch|fetch_page/i.test(name)) return "web";
            if (/browser/i.test(name)) return "browser";
            if (/message|telegram|send/i.test(name)) return "msg";
            if (/task|spawn|sessions_spawn/i.test(name)) return "agent";
            return null;
          })() as BlockCategory | null;
          if (!catKey || !hiddenBlockTypes.has(catKey)) {
            const inputStr = JSON.stringify(block.input || {}, null, 2);
            lines.push(`**Tool:** \`${block.name}\`\n\`\`\`json\n${inputStr}\n\`\`\``);
          }
        }
      }
    } else if (typeof content === "string") {
      if (!hiddenBlockTypes.has("asst-text")) lines.push(content);
    }
    if (!lines.length) return "";
    return `**Assistant**\n\n${lines.join("\n\n")}\n\n`;
  }

  if (role === "toolResult") {
    const catKey = msg.toolName ? (() => {
      const n = msg.toolName!;
      if (/bash|exec/i.test(n)) return "exec";
      if (/read|write|edit/i.test(n)) return "file";
      if (/web|search/i.test(n)) return "web";
      if (/browser/i.test(n)) return "browser";
      if (/message|telegram/i.test(n)) return "msg";
      if (/task|spawn/i.test(n)) return "agent";
      return null;
    })() as BlockCategory | null : null;
    if (catKey && hiddenBlockTypes.has(catKey)) return "";
    const text = typeof content === "string" ? content
      : Array.isArray(content) ? (content as unknown as Record<string, unknown>[])
          .filter(b => b.type === "text").map(b => b.text as string).join("\n")
      : "";
    return `> **Result** (${msg.toolName || "tool"})\n>\n> ${text.slice(0, 500).replace(/\n/g, "\n> ")}${text.length > 500 ? "\n> *[truncated]*" : ""}\n\n`;
  }

  return "";
}

function exportSession(messages: NormalizedMessage[], hiddenBlockTypes: Set<BlockCategory>, format: "markdown" | "json" | "text") {
  if (format === "json") {
    const visible = messages.filter(e => {
      if (e.type === "compaction" || e.type === "model_change") return true;
      const msg = e.message;
      if (!msg) return false;
      if (msg.role === "user" && hiddenBlockTypes.has("user-msg")) return false;
      return true;
    });
    return JSON.stringify(visible, null, 2);
  }
  // markdown or plain text
  const parts: string[] = [];
  for (const entry of messages) {
    if (entry.type === "compaction") { parts.push("---\n*[context compacted]*\n---\n\n"); continue; }
    if (entry.type === "model_change") { parts.push(`---\n*[model: ${entry.modelId}]*\n\n`); continue; }
    if (entry.type !== "message") continue;
    const line = entryToMarkdown(entry, hiddenBlockTypes);
    if (line) parts.push(line);
  }
  const md = parts.join("");
  if (format === "text") {
    // strip markdown syntax for plain text
    return md
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
      .replace(/^>\s*/gm, "  ")
      .replace(/^---+$/gm, "──────────────────────────────")
      .trim();
  }
  return md;
}

function ExportButton({ messages, hiddenBlockTypes, sess }: {
  messages: NormalizedMessage[];
  hiddenBlockTypes: Set<BlockCategory>;
  sess: SessionInfo | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const doCopy = (format: "markdown" | "json" | "text") => {
    const text = exportSession(messages, hiddenBlockTypes, format);
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(format);
    setTimeout(() => { setCopied(null); setOpen(false); }, 900);
  };

  const doDownload = () => {
    const md = formatSessionMarkdown(messages, sess);
    const filename = `session-${sess?.sessionId?.slice(-8) || "export"}-${new Date().toISOString().slice(0, 10)}.md`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className="export-btn-wrap" ref={ref}>
      <button className="panel-icon-btn" title="Export session" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="export-dropdown">
          <button className="export-option" onClick={() => doCopy("markdown")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h12M2 7h8M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {copied === "markdown" ? "Copied!" : "Copy as Markdown"}
          </button>
          <button className="export-option" onClick={() => doCopy("text")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M5 8h6M4 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {copied === "text" ? "Copied!" : "Copy as plain text"}
          </button>
          <button className="export-option" onClick={() => doCopy("json")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 2H2.5A1.5 1.5 0 001 3.5v2A1.5 1.5 0 002.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M4 14H2.5A1.5 1.5 0 011 12.5v-2A1.5 1.5 0 012.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M12 2h1.5A1.5 1.5 0 0115 3.5v2A1.5 1.5 0 0113.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M12 14h1.5A1.5 1.5 0 0015 12.5v-2A1.5 1.5 0 0013.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
            </svg>
            {copied === "json" ? "Copied!" : "Copy as JSON"}
          </button>
          <div className="export-divider" />
          <button className="export-option" onClick={doDownload}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M4 8l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Download as .md
          </button>
          <div className="export-note">copy options respect block filters</div>
        </div>
      )}
    </div>
  );
}

// ── LLM Ref Popover ──
function LlmRefPopover({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const claudeCmd = `claude --context "${filePath}" ""`;

  return (
    <div className="llm-ref-popover" ref={ref}>
      <div className="llm-ref-path">{filePath}</div>
      <div className="llm-ref-actions">
        <button className="llm-ref-btn" onClick={() => { copyToClipboard(filePath); onClose(); }}>Copy path</button>
        <button className="llm-ref-btn" onClick={() => { copyToClipboard(claudeCmd); onClose(); }}>Copy claude command</button>
      </div>
    </div>
  );
}

// ── Session Stats ──
function SessionStatsBar({ messages, sess }: { messages: NormalizedMessage[]; sess: SessionInfo | undefined }) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    let userCount = 0;
    let assistantCount = 0;
    const toolCounts: Record<string, number> = {};
    let firstTs = "";
    let lastTs = "";
    let spawns = 0;
    let tokenEstimate = 0;

    for (const m of messages) {
      if (m.timestamp) {
        if (!firstTs) firstTs = m.timestamp;
        lastTs = m.timestamp;
      }
      if (m.message?.role === "user" && m.type !== "tool_result" && !m.message.toolCallId) userCount++;
      if (m.message?.role === "assistant") {
        assistantCount++;
        if (Array.isArray(m.message.content)) {
          for (const block of m.message.content as unknown as Record<string, unknown>[]) {
            if (block.type === "tool_use") {
              const name = (block.name as string) || "unknown";
              toolCounts[name] = (toolCounts[name] || 0) + 1;
              if (name === "sessions_spawn" || name === "Task" || name === "task") spawns++;
            }
          }
        }
      }
      if (m.message?.role === "toolResult") {
        const name = m.message.toolName || "unknown";
        toolCounts[name] = (toolCounts[name] || 0) + 1;
      }
      // Estimate tokens from _usage events or text length
      if ((m as unknown as Record<string, unknown>).usage) {
        const usage = (m as unknown as Record<string, unknown>).usage as Record<string, number>;
        tokenEstimate += (usage.input_tokens || 0) + (usage.output_tokens || 0);
      }
    }

    const duration = firstTs && lastTs
      ? Math.max(0, new Date(lastTs).getTime() - new Date(firstTs).getTime())
      : 0;

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const totalToolCalls = Object.values(toolCounts).reduce((s, v) => s + v, 0);

    return { userCount, assistantCount, totalToolCalls, topTools, toolCounts, duration, spawns, tokenEstimate };
  }, [messages]);

  const fmtDuration = (ms: number) => {
    if (ms < 60000) return Math.round(ms / 1000) + "s";
    if (ms < 3600000) return Math.round(ms / 60000) + "m";
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  return (
    <div className="stats-bar">
      <div className="stats-summary" onClick={() => setExpanded(!expanded)}>
        <span className="stats-item" title="Messages">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H4l-2 2V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
          {stats.userCount + stats.assistantCount}
        </span>
        <span className="stats-item" title="Tool calls">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M9.5 2.5l4 4-7 7-4 0 0-4 7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
          {stats.totalToolCalls}
          {stats.topTools.length > 0 && (
            <span className="stats-tools-inline">
              ({stats.topTools.map(([n, c]) => `${n}:${c}`).join(", ")})
            </span>
          )}
        </span>
        {stats.duration > 0 && (
          <span className="stats-item" title="Duration">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            {fmtDuration(stats.duration)}
          </span>
        )}
        {stats.tokenEstimate > 0 && (
          <span className="stats-item" title="Estimated tokens">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M6 5h4M5 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            {stats.tokenEstimate.toLocaleString()} tok
          </span>
        )}
        {stats.spawns > 0 && (
          <span className="stats-item" title="Subagent spawns">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 14v-2a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.2"/></svg>
            {stats.spawns} spawns
          </span>
        )}
        <span className="stats-expand-hint">{expanded ? "collapse" : "expand"}</span>
      </div>
      {expanded && (
        <div className="stats-detail">
          <div className="stats-detail-row"><span>User messages</span><span>{stats.userCount}</span></div>
          <div className="stats-detail-row"><span>Assistant messages</span><span>{stats.assistantCount}</span></div>
          <div className="stats-detail-row"><span>Total tool calls</span><span>{stats.totalToolCalls}</span></div>
          {Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <div key={name} className="stats-detail-row sub"><span>{name}</span><span>{count}</span></div>
          ))}
          {stats.duration > 0 && <div className="stats-detail-row"><span>Duration</span><span>{fmtDuration(stats.duration)}</span></div>}
          {stats.spawns > 0 && <div className="stats-detail-row"><span>Subagent spawns</span><span>{stats.spawns}</span></div>}
          {stats.tokenEstimate > 0 && <div className="stats-detail-row"><span>Estimated tokens</span><span>{stats.tokenEstimate.toLocaleString()}</span></div>}
        </div>
      )}
    </div>
  );
}

// ── Error detection ──
function useErrorInfo(messages: NormalizedMessage[]) {
  return useMemo(() => {
    const errors: { index: number; toolName: string }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.message?.role === "toolResult" && m.message.isError) {
        errors.push({ index: i, toolName: m.message.toolName || "tool" });
      }
    }
    return errors;
  }, [messages]);
}

// ── Export helpers ──
function formatSessionMarkdown(messages: NormalizedMessage[], sess: SessionInfo | undefined): string {
  const lines: string[] = [];
  const title = sess ? sessionLabel(sess) : "Session";
  const provider = sess?.source || "unknown";
  const date = sess?.lastUpdated ? new Date(sess.lastUpdated).toLocaleDateString() : "unknown";
  const msgCount = messages.filter(m => m.message?.role === "user" || m.message?.role === "assistant").length;

  lines.push(`# Session: ${title}`);
  lines.push(`Provider: ${provider} | Date: ${date} | Messages: ${msgCount}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const m of messages) {
    if (m.type === "compaction") {
      lines.push("*[context compacted]*");
      lines.push("");
      continue;
    }
    if (m.type !== "message" || !m.message) continue;

    const role = m.message.role;
    if (role === "user") {
      const text = extractText(m.message.content);
      if (text) {
        lines.push(`**User:** ${text}`);
        lines.push("");
      }
    } else if (role === "assistant") {
      const text = extractText(m.message.content);
      if (text) {
        lines.push(`**Assistant:** ${text}`);
        lines.push("");
      }
      // Include tool calls
      if (Array.isArray(m.message.content)) {
        for (const block of m.message.content as unknown as Record<string, unknown>[]) {
          if (block.type === "tool_use") {
            const name = (block.name as string) || "tool";
            const input = (block.input || {}) as Record<string, unknown>;
            const cmd = (input.command as string) || (input.file_path as string) || (input.query as string) || "";
            if (cmd) {
              lines.push(`> **${name}:** ${cmd}`);
            } else {
              lines.push(`> **${name}**`);
            }
          }
        }
        lines.push("");
      }
    } else if (role === "toolResult") {
      const toolName = m.message.toolName || "tool";
      const text = extractResultText(m.message.content);
      const isError = m.message.isError;
      const preview = text.slice(0, 200).replace(/\n/g, "\n> ");
      if (isError) {
        lines.push(`> **${toolName} error:**`);
      } else {
        lines.push(`> **${toolName} result:**`);
      }
      if (preview) lines.push(`> ${preview}${text.length > 200 ? "..." : ""}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export default function MainPanel() {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const currentMessages = useStore((s) => s.currentMessages);
  const loading = useStore((s) => s.loading);
  const sseConnected = useStore((s) => s.sseConnected);
  const allThinkingExpanded = useStore((s) => s.allThinkingExpanded);
  const toggleAllThinking = useStore((s) => s.toggleAllThinking);
  const blockExpansion = useStore((s) => s.blockExpansion);
  const toggleBlockExpansion = useStore((s) => s.toggleBlockExpansion);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setMessages = useStore((s) => s.setMessages);
  const setLoading = useStore((s) => s.setLoading);
  const blockColors = useStore((s) => s.blockColors);
  const appSettings = useStore((s) => s.settings);
  const scrollTargetIndex = useStore((s) => s.scrollTargetIndex);
  const setScrollTargetIndex = useStore((s) => s.setScrollTargetIndex);
  const activeSessions = useStore((s) => s.activeSessions);
  const hiddenBlockTypes = useStore((s) => s.hiddenBlockTypes);
  const toggleHiddenBlockType = useStore((s) => s.toggleHiddenBlockType);
  const pinnedBlocks = useStore((s) => s.pinnedBlocks);
  const togglePinBlock = useStore((s) => s.togglePinBlock);

  const pinnedBlockIds = useMemo(
    () => new Set((currentSessionId ? (pinnedBlocks[currentSessionId] || []) : []).map(b => b.blockId)),
    [pinnedBlocks, currentSessionId]
  );

  const handlePinBlock = useCallback((blockId: string, blockType: string, preview: string) => {
    if (!currentSessionId) return;
    // Find msg index from blockId (format: "type-msgIndex-blockIndex" or "type-msgIndex")
    const parts = blockId.split("-");
    const msgIndex = parseInt(parts[1] ?? "0", 10) || 0;
    togglePinBlock(currentSessionId, { blockId, msgIndex, blockType, preview });
  }, [currentSessionId, togglePinBlock]);

  const messagesRef = useRef<HTMLDivElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);
  const loadingMoreRef = useRef(false);
  const [refPopoverOpen, setRefPopoverOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return 13;
    return parseInt(localStorage.getItem("llm-deep-trace-font-size") || "13", 10);
  });
  const changeFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.min(20, Math.max(10, prev + delta));
      localStorage.setItem("llm-deep-trace-font-size", String(next));
      return next;
    });
  }, []);

  const sess = sessions.find((s) => s.sessionId === currentSessionId);
  const errors = useErrorInfo(currentMessages);

  // Must be declared before any early return — Rules of Hooks
  const displayMessages = useMemo(() => {
    if (!appSettings.skipPreamble) return currentMessages;
    let firstUserIdx = -1;
    for (let i = 0; i < currentMessages.length; i++) {
      const role = currentMessages[i].message?.role;
      if (role === "user") { firstUserIdx = i; break; }
    }
    if (firstUserIdx <= 0) return currentMessages;
    return currentMessages.slice(firstUserIdx);
  }, [currentMessages, appSettings.skipPreamble]);

  // Build tool inputs map: toolCallId → input args (so tool results can access original inputs)
  const toolInputsMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const msg of currentMessages) {
      if (msg.message?.role === "assistant" && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content as unknown as Record<string, unknown>[]) {
          if ((block.type === "tool_use" || block.type === "toolCall") && block.id) {
            map.set(
              block.id as string,
              (block.input || block.arguments || {}) as Record<string, unknown>
            );
          }
        }
      }
    }
    return map;
  }, [currentMessages]);

  // Navigate to a child/subagent session by key or ID (supports partial ID matching)
  const handleNavigateToSession = useCallback(
    (keyOrId: string) => {
      if (!keyOrId) return;
      const target = sessions.find(
        (s) =>
          s.sessionId === keyOrId ||
          s.key === keyOrId ||
          s.sessionId.startsWith(keyOrId) ||
          s.key.endsWith("/" + keyOrId.slice(0, 8))
      );
      if (target) {
        setCurrentSession(target.sessionId);
      }
    },
    [sessions, setCurrentSession]
  );

  // Load messages when session changes
  useEffect(() => {
    if (!currentSessionId) return;
    setLoading(true);
    setDisplayCount(100);

    const source = sess?.source || "kova";
    fetch(`/api/sessions/${currentSessionId}/messages?source=${source}`)
      .then((res) => res.json())
      .then((entries) => {
        if (!Array.isArray(entries)) {
          setMessages([]);
        } else {
          setMessages(entries);
        }
        setLoading(false);
        setTimeout(() => {
          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        }, 50);
      })
      .catch(() => {
        setMessages([]);
        setLoading(false);
      });
  }, [currentSessionId, sess?.source, setMessages, setLoading]);

  // Infinite scroll: load previous 50 messages when scrolling to top
  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el || loadingMoreRef.current) return;

    const total = currentMessages.length;
    const startIdx = Math.max(0, total - displayCount);

    if (el.scrollTop <= 10 && startIdx > 0) {
      loadingMoreRef.current = true;
      const prevScrollHeight = el.scrollHeight;

      setDisplayCount((prev) => prev + 50);

      // Preserve scroll position after loading more
      requestAnimationFrame(() => {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
        loadingMoreRef.current = false;
      });
    }
  }, [currentMessages.length, displayCount]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "f" && currentSessionId) {
        e.preventDefault();
        setSearchVisible(true);
      }
      if (e.key === "Escape" && searchVisible) {
        setSearchVisible(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [currentSessionId, searchVisible]);

  // Arrow key navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const curr = useStore.getState().filteredSessions;
        let idx = curr.findIndex((s) => s.sessionId === useStore.getState().currentSessionId);
        idx += e.key === "ArrowDown" ? 1 : -1;
        if (idx < 0) idx = 0;
        if (idx >= curr.length) idx = curr.length - 1;
        if (curr[idx]) setCurrentSession(curr[idx].sessionId);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [setCurrentSession]);

  // Scroll to message when scrollTargetIndex is set (from tree panel)
  useEffect(() => {
    if (scrollTargetIndex === null) return;
    // Ensure the target message is in the visible range
    const total = currentMessages.length;
    const needed = total - scrollTargetIndex;
    if (needed > displayCount) {
      setDisplayCount(needed + 10);
    }
    // Defer scroll to allow render
    requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (!container) return;
      const el = container.querySelector(
        `[data-msg-index="${scrollTargetIndex}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Flash highlight
        el.classList.add("msg-scroll-highlight");
        setTimeout(() => el.classList.remove("msg-scroll-highlight"), 1500);
      }
    });
    setScrollTargetIndex(null);
  }, [scrollTargetIndex, currentMessages.length, displayCount, setScrollTargetIndex]);

  if (!currentSessionId) {
    return (
      <div className="empty-state" style={{ background: "var(--bg)" }}>
        <div className="empty-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="4" y="5" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="empty-title">No session selected</div>
        <div className="empty-hint">Use &uarr;&darr; to navigate &middot; &#8984;K to search</div>
      </div>
    );
  }

  const label = sess ? sessionLabel(sess) : currentSessionId.slice(0, 14) + "\u2026";

  const total = displayMessages.length;
  const startIdx = Math.max(0, total - displayCount);
  const visible = displayMessages.slice(startIdx);

  return (
    <div className="main-panel">
      {/* Header */}
      <div className="main-header">
        <div className="main-header-top">
          <span className="main-session-label">{label}</span>
          <span
            className="main-session-id"
            title="Click to copy session ID"
            onClick={() => copyToClipboard(currentSessionId, "Session ID copied")}
          >
            {currentSessionId.slice(0, 16)}&hellip;
          </span>
          {sess?.channel && (
            <span className="main-meta">
              <span dangerouslySetInnerHTML={{ __html: channelIcon(sess.channel) }} />{" "}
              <b>{sess.channel}</b>
            </span>
          )}
          <span className="main-meta">
            updated <b>{relativeTime(sess?.lastUpdated || 0)}</b>
          </span>
          {sess?.compactionCount ? (
            <span className="main-meta">
              &middot; <b>{sess.compactionCount} compactions</b>
            </span>
          ) : null}
          <span className="main-spacer" />
          {/* Jump to error badge */}
          {errors.length > 0 && (
            <button
              className="error-badge-btn"
              title={`${errors.length} error${errors.length !== 1 ? "s" : ""} — click to jump`}
              onClick={() => {
                const idx = errors[0].index;
                const total = currentMessages.length;
                const needed = total - idx;
                if (needed > displayCount) setDisplayCount(needed + 10);
                requestAnimationFrame(() => {
                  const container = messagesRef.current;
                  if (!container) return;
                  const el = container.querySelector(`[data-msg-index="${idx}"]`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("msg-scroll-highlight");
                    setTimeout(() => el.classList.remove("msg-scroll-highlight"), 1500);
                  }
                });
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 6v3M8 11v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              {errors.length} error{errors.length !== 1 ? "s" : ""}
            </button>
          )}
          {/* LLM Ref button */}
          {sess?.filePath && (
            <div style={{ position: "relative" }}>
              <button
                className={`toolbar-btn ${refPopoverOpen ? "active" : ""}`}
                onClick={() => setRefPopoverOpen(!refPopoverOpen)}
                title="Session file reference"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8H4V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
              {refPopoverOpen && <LlmRefPopover filePath={sess.filePath} onClose={() => setRefPopoverOpen(false)} />}
            </div>
          )}
          {/* Font size */}
          <div className="font-size-ctrl" title="Adjust text size">
            <button className="fs-btn" onClick={() => changeFontSize(-1)} disabled={fontSize <= 10}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <text x="0" y="12" fontSize="11" fill="currentColor" fontFamily="system-ui">A</text>
                <text x="8" y="14" fontSize="8" fill="currentColor" fontFamily="system-ui">−</text>
              </svg>
            </button>
            <span className="fs-value">{fontSize}</span>
            <button className="fs-btn" onClick={() => changeFontSize(1)} disabled={fontSize >= 20}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <text x="0" y="12" fontSize="13" fill="currentColor" fontFamily="system-ui">A</text>
                <text x="10" y="9" fontSize="8" fill="currentColor" fontFamily="system-ui">+</text>
              </svg>
            </button>
          </div>
          {/* Export */}
          <ExportButton messages={currentMessages} hiddenBlockTypes={hiddenBlockTypes} sess={sess} />
        </div>
        {/* Parent breadcrumb — shown when viewing a subagent */}
        {sess?.parentSessionId && (() => {
          const parent = sessions.find(s =>
            s.sessionId === sess.parentSessionId || s.key === sess.parentSessionId
          );
          return parent ? (
            <div className="parent-crumb">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <button
                className="parent-crumb-btn"
                onClick={() => setCurrentSession(parent.key || parent.sessionId)}
                title="Go to parent session"
              >
                {sessionLabel(parent)}
              </button>
              <span className="parent-crumb-label">parent</span>
            </div>
          ) : null;
        })()}
      </div>

      {/* Block toggle toolbar */}
      <BlockToggleToolbar
        blockExpansion={blockExpansion}
        blockColors={blockColors}
        onToggle={toggleBlockExpansion}
        hiddenBlockTypes={hiddenBlockTypes}
        onToggleHidden={toggleHiddenBlockType}
      />

      {/* Session stats */}
      {currentSessionId && currentMessages.length > 0 && (
        <SessionStatsBar messages={currentMessages} sess={sess} />
      )}

      {/* Search bar */}
      <MsgSearchBar visible={searchVisible} onClose={() => setSearchVisible(false)} />

      {/* Pinned blocks strip */}
      {currentSessionId && (pinnedBlocks[currentSessionId]?.length ?? 0) > 0 && (
        <PinnedStrip
          blocks={pinnedBlocks[currentSessionId]}
          onUnpin={(blockId) => {
            const block = (pinnedBlocks[currentSessionId] || []).find(b => b.blockId === blockId);
            if (block) togglePinBlock(currentSessionId, block);
          }}
          onScrollTo={(idx) => {
            const total = currentMessages.length;
            const needed = total - idx;
            if (needed > displayCount) setDisplayCount(needed + 10);
            requestAnimationFrame(() => {
              const el = messagesRef.current?.querySelector(`[data-msg-index="${idx}"]`);
              if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
            });
          }}
        />
      )}

      {/* Messages */}
      <div
        id="messages-container"
        ref={messagesRef}
        className="messages-thread scroller"
        style={{ "--msg-font-size": `${fontSize}px` } as React.CSSProperties}
      >
        <div className="messages-inner">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              Loading&hellip;
            </div>
          ) : currentMessages.length === 0 ? (
            <div className="loading-state">No messages</div>
          ) : (
            visible.map((entry, i) => {
              const absIdx = startIdx + i;
              return (
                <div key={absIdx} data-msg-index={absIdx} className="msg-wrap">
                  <MessageRenderer
                    entry={entry}
                    allThinkingExpanded={allThinkingExpanded}
                    blockExpansion={blockExpansion}
                    blockColors={blockColors}
                    settings={appSettings}
                    toolInputsMap={toolInputsMap}
                    onNavigateSession={handleNavigateToSession}
                    msgIndex={absIdx}
                    pinnedBlockIds={pinnedBlockIds}
                    onPinBlock={handlePinBlock}
                    hiddenBlockTypes={hiddenBlockTypes}
                    isSubagentSession={sess?.isSubagent}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

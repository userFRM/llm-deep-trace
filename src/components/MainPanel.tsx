"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useStore, BlockCategory } from "@/lib/store";
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
        placeholder="Search in session\u2026"
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
      {BLOCK_PILLS.map(({ category, label }) => {
        const hidden = hiddenBlockTypes.has(category);
        const expanded = !hidden && blockExpansion[category];
        const color = blockColors[category] || "#888899";
        // state: "hidden" | "collapsed" | "expanded"
        const state = hidden ? "hidden" : expanded ? "expanded" : "collapsed";
        const titles = {
          collapsed: `${label} — visible, collapsed. Click to expand.`,
          expanded:  `${label} — visible, expanded. Click to hide.`,
          hidden:    `${label} — hidden. Click to show.`,
        };
        return (
          <button
            key={category}
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
        );
      })}
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

function ExportDropdown({ messages, sess, onClose }: { messages: NormalizedMessage[]; sess: SessionInfo | undefined; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const md = useMemo(() => formatSessionMarkdown(messages, sess), [messages, sess]);
  const title = sess ? sessionLabel(sess) : "session";
  const filename = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) + ".md";

  const handleDownload = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleCopy = () => {
    copyToClipboard(md);
    onClose();
  };

  return (
    <div className="export-dropdown" ref={ref}>
      <button className="export-option" onClick={handleDownload}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 8l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        Export as Markdown
      </button>
      <button className="export-option" onClick={handleCopy}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M3 11V3h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Copy all as text
      </button>
    </div>
  );
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

  const messagesRef = useRef<HTMLDivElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);
  const loadingMoreRef = useRef(false);
  const [refPopoverOpen, setRefPopoverOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
          {/* Export button */}
          <div style={{ position: "relative" }}>
            <button
              className={`toolbar-btn ${exportOpen ? "active" : ""}`}
              onClick={() => setExportOpen(!exportOpen)}
              title="Export session"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 8l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
            {exportOpen && <ExportDropdown messages={currentMessages} sess={sess} onClose={() => setExportOpen(false)} />}
          </div>
          <div
            className="live-indicator"
            style={{ color: sseConnected ? "var(--green)" : "var(--red)" }}
          >
            <div
              className="live-dot"
              style={{ background: sseConnected ? "var(--green)" : "var(--red)" }}
            />
            {currentSessionId && activeSessions.has(currentSessionId)
              ? "tailing"
              : sseConnected ? "connected" : "offline"}
          </div>
        </div>
        <div className="main-toolbar">
          <button
            className={`toolbar-btn ${searchVisible ? "active" : ""}`}
            onClick={() => setSearchVisible(!searchVisible)}
          >
            search &#8984;F
          </button>
        </div>
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

      {/* Messages */}
      <div
        id="messages-container"
        ref={messagesRef}
        className="messages-thread scroller"
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
            visible.map((entry, i) => (
              <div key={startIdx + i} data-msg-index={startIdx + i}>
                <MessageRenderer
                  entry={entry}
                  allThinkingExpanded={allThinkingExpanded}
                  blockExpansion={blockExpansion}
                  blockColors={blockColors}
                  settings={appSettings}
                  toolInputsMap={toolInputsMap}
                  onNavigateSession={handleNavigateToSession}
                  hiddenBlockTypes={hiddenBlockTypes}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

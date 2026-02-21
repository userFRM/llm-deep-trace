"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { sessionLabel, relativeTime, channelIcon, copyToClipboard } from "@/lib/client-utils";
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

export default function MainPanel() {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const currentMessages = useStore((s) => s.currentMessages);
  const loading = useStore((s) => s.loading);
  const sseConnected = useStore((s) => s.sseConnected);
  const allThinkingExpanded = useStore((s) => s.allThinkingExpanded);
  const toggleAllThinking = useStore((s) => s.toggleAllThinking);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setMessages = useStore((s) => s.setMessages);
  const setLoading = useStore((s) => s.setLoading);
  const blockColors = useStore((s) => s.blockColors);
  const appSettings = useStore((s) => s.settings);

  const messagesRef = useRef<HTMLDivElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);
  const loadingMoreRef = useRef(false);

  const sess = sessions.find((s) => s.sessionId === currentSessionId);

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

  // Navigate to a child/subagent session by key or ID
  const handleNavigateToSession = useCallback(
    (keyOrId: string) => {
      if (!keyOrId) return;
      const target = sessions.find(
        (s) => s.sessionId === keyOrId || s.key === keyOrId
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
  const total = currentMessages.length;
  const startIdx = Math.max(0, total - displayCount);
  const visible = currentMessages.slice(startIdx);

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
          <div
            className="live-indicator"
            style={{ color: sseConnected ? "var(--green)" : "var(--red)" }}
          >
            <div
              className="live-dot"
              style={{ background: sseConnected ? "var(--green)" : "var(--red)" }}
            />
            {sseConnected ? "live" : "offline"}
          </div>
        </div>
        <div className="main-toolbar">
          <button
            className={`toolbar-btn ${allThinkingExpanded ? "active" : ""}`}
            onClick={toggleAllThinking}
          >
            {allThinkingExpanded ? "collapse thinking" : "thinking"}
          </button>
          <button
            className={`toolbar-btn ${searchVisible ? "active" : ""}`}
            onClick={() => setSearchVisible(!searchVisible)}
          >
            search &#8984;F
          </button>
        </div>
      </div>

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
              <MessageRenderer
                key={startIdx + i}
                entry={entry}
                allThinkingExpanded={allThinkingExpanded}
                blockColors={blockColors}
                settings={appSettings}
                toolInputsMap={toolInputsMap}
                onNavigateSession={handleNavigateToSession}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

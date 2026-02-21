"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { sessionLabel, relativeTime, cleanPreview } from "@/lib/client-utils";
import { SessionInfo } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";

const ChevronSvg = () => (
  <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const sourceColors: Record<string, string> = {
  kova: "#9B72EF",
  claude: "#3B82F6",
  codex: "#F59E0B",
};

function SessionItem({
  session,
  isSubagent,
  childCount,
  isExpanded,
  isSelected,
  onSelect,
  onToggleExpand,
}: {
  session: SessionInfo;
  isSubagent: boolean;
  childCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const label = sessionLabel(session);
  const src = session.source || "kova";
  const dotCls = isSubagent
    ? "subagent"
    : session.isActive && !session.isDeleted
    ? "active"
    : "inactive";
  const preview = cleanPreview(session.preview || "");

  let cls = "session-item";
  if (isSelected) cls += " selected";
  if (isSubagent) cls += " subagent";

  return (
    <div className={cls} onClick={() => onSelect(session.sessionId)}>
      <div className="session-row">
        {childCount > 0 && (
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(session.sessionId);
            }}
            title={`${isExpanded ? "Collapse" : "Expand"} ${childCount} subagent${childCount !== 1 ? "s" : ""}`}
          >
            <span className={`expand-chevron ${isExpanded ? "open" : ""}`}>
              <ChevronSvg />
            </span>
          </button>
        )}
        <div className={`session-dot ${dotCls}`} />
        <span className={`session-label ${isSubagent ? "sub" : ""}`}>
          {label}
        </span>
        {isSubagent && <span className="subagent-badge">sub</span>}
        <span className="session-time">
          {relativeTime(session.lastUpdated)}
        </span>
      </div>
      <div className="session-meta">
        <span className="session-source" style={{ color: sourceColors[src] || "var(--text-2)" }}>
          {src}
        </span>
        <span className="session-msgs">
          {session.messageCount || 0} msgs
        </span>
        {session.compactionCount > 0 && (
          <span className="session-msgs">
            &middot; {session.compactionCount}&times;
          </span>
        )}
        {childCount > 0 && !isExpanded && (
          <span className="session-msgs" style={{ color: "var(--accent)" }}>
            {childCount} sub
          </span>
        )}
      </div>
      {preview && (
        <div className="session-preview">{preview}</div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const filteredSessions = useStore((s) => s.filteredSessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const searchQuery = useStore((s) => s.searchQuery);
  const sourceFilters = useStore((s) => s.sourceFilters);
  const expandedGroups = useStore((s) => s.expandedGroups);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const toggleSourceFilter = useStore((s) => s.toggleSourceFilter);
  const toggleGroupExpanded = useStore((s) => s.toggleGroupExpanded);
  const setCurrentSession = useStore((s) => s.setCurrentSession);

  const searchRef = useRef<HTMLInputElement>(null);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 120);
    },
    [setSearchQuery]
  );

  // Build parent/child map
  const childrenOf = new Map<string, SessionInfo[]>();
  const childIds = new Set<string>();
  for (const s of filteredSessions) {
    const isKovaSub = s.key?.startsWith("agent:main:subagent:");
    let parentId = s.parentSessionId;
    if (!parentId && isKovaSub) {
      const main = filteredSessions.find((p) => p.key === "agent:main:main");
      if (main) parentId = main.sessionId;
    }
    if (parentId) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(s);
      childIds.add(s.sessionId);
    }
  }

  const handleSelect = useCallback(
    (id: string) => {
      setCurrentSession(id);
    },
    [setCurrentSession]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const srcBadges = [
    { key: "kova", label: "kova" },
    { key: "claude", label: "claude" },
    { key: "codex", label: "codex" },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="sidebar-title">kova</span>
          <span className="sidebar-subtitle">sessions</span>
          <span className="sidebar-count">{sessions.length}</span>
          <ThemeToggle />
        </div>

        <div className="search-wrap">
          <span className="search-icon"><SearchIcon /></span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter sessions"
            autoComplete="off"
            spellCheck={false}
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLocalSearch("");
                setSearchQuery("");
                if (debounceRef.current) clearTimeout(debounceRef.current);
                searchRef.current?.blur();
              }
            }}
            className="search-input"
          />
          <span className="search-kbd">&#8984;K</span>
        </div>

        <div className="source-filters">
          {srcBadges.map(({ key, label }) => (
            <label key={key} className="source-filter">
              <input
                type="checkbox"
                checked={(sourceFilters as Record<string, boolean>)[key]}
                onChange={() => toggleSourceFilter(key)}
              />
              <span
                className={`source-filter-label ${(sourceFilters as Record<string, boolean>)[key] ? "active" : "inactive"}`}
                data-source={key}
              >
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="session-list scroller">
        {filteredSessions.length === 0 ? (
          <div className="session-list-empty">
            {searchQuery ? "No matches" : "No sessions"}
          </div>
        ) : (
          filteredSessions.map((s) => {
            if (childIds.has(s.sessionId)) return null;
            const children = childrenOf.get(s.sessionId) || [];
            const childIsSelected = children.some(c => c.sessionId === currentSessionId);
            const isExpanded = expandedGroups.has(s.sessionId) || currentSessionId === s.sessionId || childIsSelected;

            return (
              <div key={s.sessionId}>
                <SessionItem
                  session={s}
                  isSubagent={false}
                  childCount={children.length}
                  isExpanded={isExpanded}
                  isSelected={currentSessionId === s.sessionId}
                  onSelect={handleSelect}
                  onToggleExpand={toggleGroupExpanded}
                />
                {children.length > 0 && isExpanded && (
                  <div className="subagent-children">
                    {children.map((c) => (
                      <SessionItem
                        key={c.sessionId}
                        session={c}
                        isSubagent={true}
                        childCount={0}
                        isExpanded={false}
                        isSelected={currentSessionId === c.sessionId}
                        onSelect={handleSelect}
                        onToggleExpand={toggleGroupExpanded}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

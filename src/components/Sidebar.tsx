"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { sessionLabel, relativeTime, cleanPreview, copyToClipboard } from "@/lib/client-utils";
import { SessionInfo } from "@/lib/types";
import SettingsPanel from "./SettingsPanel";
import Logo from "./Logo";

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

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const sourceColors: Record<string, string> = {
  kova: "#9B72EF",
  claude: "#3B82F6",
  codex: "#F59E0B",
  kimi: "#06B6D4",
  gemini: "#22C55E",
  copilot: "#52525B",
  factory: "#F97316",
  opencode: "#14B8A6",
  aider: "#EC4899",
  continue: "#8B5CF6",
  cursor: "#6366F1",
};

const BotSvg = () => (
  <svg viewBox="0 0 14 14" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" className="bot-icon">
    <rect x="2" y="5" width="10" height="7" rx="1.5" stroke="#22C55E" strokeWidth="1.4"/>
    <rect x="5" y="2" width="4" height="3" rx="1" stroke="#22C55E" strokeWidth="1.4"/>
    <circle cx="5" cy="8.5" r="1" fill="#22C55E"/>
    <circle cx="9" cy="8.5" r="1" fill="#22C55E"/>
  </svg>
);

const PLAN_KEYWORDS = /\b(plan|step\s*\d|task\s*list|implement|phase\s*\d|milestone|roadmap|execute)\b/i;

function isPlanSession(session: SessionInfo): boolean {
  const text = `${session.label || ""} ${session.preview || ""}`;
  return PLAN_KEYWORDS.test(text);
}

function ContextMenu({
  x,
  y,
  session,
  isArchived,
  selectedCount,
  onClose,
  onDelete,
}: {
  x: number;
  y: number;
  session: SessionInfo;
  isArchived: boolean;
  selectedCount: number;
  onClose: () => void;
  onDelete: (sessionId: string) => void;
}) {
  const archiveSession = useStore((s) => s.archiveSession);
  const unarchiveSession = useStore((s) => s.unarchiveSession);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const deleteLabel = selectedCount > 1
    ? `Delete ${selectedCount} sessions`
    : "Delete";

  return (
    <div ref={ref} className="ctx-menu" style={{ top: y, left: x }}>
      {isArchived ? (
        <button className="ctx-menu-item"
          onClick={() => { unarchiveSession(session.sessionId); onClose(); }}>
          Unarchive
        </button>
      ) : (
        <button className="ctx-menu-item"
          onClick={() => { archiveSession(session.sessionId); onClose(); }}>
          Archive
        </button>
      )}
      <button className="ctx-menu-item"
        onClick={() => { copyToClipboard(session.sessionId, "Session ID copied"); onClose(); }}>
        Copy ID
      </button>
      {session.filePath && (
        <button className="ctx-menu-item"
          onClick={() => { copyToClipboard(session.filePath!, "Path copied"); onClose(); }}>
          Copy path
        </button>
      )}
      <div className="ctx-menu-sep" />
      <button className="ctx-menu-item ctx-menu-danger"
        onClick={() => { onDelete(session.sessionId); onClose(); }}>
        {deleteLabel}
      </button>
    </div>
  );
}

function SessionItem({
  session,
  isSubagent,
  childCount,
  hasSubagents,
  isExpanded,
  isSelected,
  isChecked,
  anyChecked,
  isLive,
  isArchived,
  isStarred,
  compact,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onToggleStar,
  onCheck,
}: {
  session: SessionInfo;
  isSubagent: boolean;
  childCount: number;
  hasSubagents: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isChecked: boolean;
  anyChecked: boolean;
  isLive: boolean;
  isArchived: boolean;
  isStarred: boolean;
  compact: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, session: SessionInfo) => void;
  onToggleStar: (id: string) => void;
  onCheck: (id: string, shift: boolean) => void;
}) {
  const label = sessionLabel(session);
  const src = session.source || "kova";
  const dotCls = isLive
    ? "live"
    : isSubagent
    ? "subagent"
    : session.isActive && !session.isDeleted
    ? "active"
    : "inactive";
  const preview = cleanPreview(session.preview || "");

  let cls = "session-item";
  if (isSelected) cls += " selected";
  if (isChecked) cls += " si-checked";
  if (isSubagent) cls += " subagent";
  if (compact) cls += " compact";
  if (isArchived) cls += " archived";

  return (
    <div
      className={cls}
      onClick={() => {
        onSelect(session.sessionId);
        if (childCount > 0) onToggleExpand(session.sessionId);
      }}
      onContextMenu={(e) => onContextMenu(e, session)}
    >
      <div className="session-row">
        {/* Checkbox — visible on hover or when any row is checked */}
        <button
          className={`si-check-btn${isChecked ? " si-check-on" : ""}${anyChecked ? " si-check-visible" : ""}`}
          title={isChecked ? "Deselect" : "Select"}
          onClick={(e) => {
            e.stopPropagation();
            onCheck(session.sessionId, e.shiftKey);
          }}
        >
          {isChecked
            ? <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="3" fill="#9B72EF"/><path d="M4 7l2 2 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          }
        </button>
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
        {isLive && <span className="live-badge-small">live</span>}
        {hasSubagents && <BotSvg />}
        {isSubagent && session.isSidechain && (
          <span className="subagent-badge team-badge">team</span>
        )}
        {isSubagent && !session.isSidechain && (
          <span className="subagent-badge">subagent</span>
        )}
        {!isSubagent && isPlanSession(session) && <span className="plan-badge">plan</span>}
        <button
          className={`star-btn ${isStarred ? "starred" : ""}`}
          title={isStarred ? "Unstar" : "Star session"}
          onClick={(e) => { e.stopPropagation(); onToggleStar(session.sessionId); }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            {isStarred
              ? <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z" fill="#F59E0B"/>
              : <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            }
          </svg>
        </button>
        <span className="session-time">
          {relativeTime(session.lastUpdated)}
        </span>
      </div>
      {!compact && (
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
          {childCount > 0 && (
            <span className="subagent-count-badge">
              ({childCount} subagent{childCount !== 1 ? "s" : ""})
            </span>
          )}
        </div>
      )}
      {!compact && preview && (
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
  const expandAllGroups = useStore((s) => s.expandAllGroups);
  const collapseAllGroups = useStore((s) => s.collapseAllGroups);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const compactSidebar = useStore((s) => s.settings.compactSidebar);
  const sidebarTab = useStore((s) => s.sidebarTab);
  const activeSessions = useStore((s) => s.activeSessions);
  const archivedSessionIds = useStore((s) => s.archivedSessionIds);
  const starredSessionIds = useStore((s) => s.starredSessionIds);
  const toggleStarred = useStore((s) => s.toggleStarred);
  const pinnedBlocks = useStore((s) => s.pinnedBlocks);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const toggleSourceFilter = useStore((s) => s.toggleSourceFilter);
  const toggleGroupExpanded = useStore((s) => s.toggleGroupExpanded);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setSidebarTab = useStore((s) => s.setSidebarTab);

  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ftSearchRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dragging = useRef(false);
  const [ftResults, setFtResults] = useState<{ session: SessionInfo; snippet: string }[]>([]);
  const [ftLoading, setFtLoading] = useState(false);
  const [ftActive, setFtActive] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: SessionInfo } | null>(null);
  // Collapsed team groups: key = `${parentId}::${teamName}`
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string | null>(null);
  const deleteSessions = useStore((s) => s.deleteSessions);

  const toggleTeam = useCallback((parentId: string, teamName: string) => {
    const key = `${parentId}::${teamName}`;
    setCollapsedTeams(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 120);

      // Full-text search for 2+ chars
      if (ftSearchRef.current) clearTimeout(ftSearchRef.current);
      if (value.length >= 2) {
        ftSearchRef.current = setTimeout(() => {
          setFtLoading(true);
          setFtActive(true);
          fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: value }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (Array.isArray(data)) setFtResults(data);
              setFtLoading(false);
            })
            .catch(() => {
              setFtLoading(false);
            });
        }, 300);
      } else {
        setFtResults([]);
        setFtActive(false);
      }
    },
    [setSearchQuery]
  );

  // Build parent/child map — use full sessions list for detection
  const childrenOf = new Map<string, SessionInfo[]>();
  const childIds = new Set<string>();
  const parentIds = new Set<string>();

  // First pass: detect all parent-child relationships from full sessions list
  for (const s of sessions) {
    const isKovaSub = s.key?.startsWith("agent:main:subagent:");
    let parentId = s.parentSessionId;
    if (!parentId && isKovaSub) {
      const main = sessions.find((p) => p.key === "agent:main:main");
      if (main) parentId = main.sessionId;
    }
    if (parentId) {
      parentIds.add(parentId);
      const parentByKey = sessions.find((p) => p.key === parentId);
      if (parentByKey) parentIds.add(parentByKey.sessionId);
    }
  }

  // Second pass: build children map from filtered sessions only (for display)
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

  // hasSubagents: use the direct flag from scanner OR derive from parentSessionId links
  const hasSubagentsSet = new Set<string>();
  for (const s of sessions) {
    if (s.hasSubagents) {
      hasSubagentsSet.add(s.sessionId);
    }
    const pid = s.parentSessionId;
    if (pid) {
      hasSubagentsSet.add(pid);
      for (const p of sessions) {
        if (p.key === pid || p.sessionId === pid) hasSubagentsSet.add(p.sessionId);
      }
    }
    if (s.key?.startsWith("agent:main:subagent:")) {
      const main = sessions.find((p) => p.key === "agent:main:main");
      if (main) hasSubagentsSet.add(main.sessionId);
    }
  }

  // Determine which providers have sessions
  const activeSources = new Set<string>();
  for (const s of sessions) {
    activeSources.add(s.source || "kova");
  }

  const handleSelect = useCallback(
    (id: string) => {
      setCurrentSession(id);
    },
    [setCurrentSession]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, session: SessionInfo) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, session });
    },
    []
  );

  // Multi-select: toggle with optional shift-range
  const handleCheck = useCallback(
    (sessionId: string, shift: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && lastCheckedRef.current) {
          // Range select: find all visible session IDs between last and current
          const allVisible = filteredSessions.map((s) => s.sessionId);
          const a = allVisible.indexOf(lastCheckedRef.current);
          const b = allVisible.indexOf(sessionId);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(allVisible[i]);
          } else {
            next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
          }
        } else {
          next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
        }
        lastCheckedRef.current = sessionId;
        return next;
      });
    },
    [filteredSessions]
  );

  // Delete: if right-clicked session is in selection → delete all selected; else delete just that one
  const handleDelete = useCallback(
    (sessionId: string) => {
      const toDelete = selectedIds.has(sessionId) && selectedIds.size > 1
        ? [...selectedIds]
        : [sessionId];
      setSelectedIds(new Set());
      deleteSessions(toDelete);
    },
    [selectedIds, deleteSessions]
  );

  // Keyboard shortcut
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

  // Drag-to-resize sidebar
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startW = sidebarRef.current?.offsetWidth || 280;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newW = startW + (ev.clientX - startX);
      setSidebarWidth(newW);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setSidebarWidth]);

  // Only show filter badges for providers that have sessions
  const allBadges = [
    { key: "kova", label: "kova" },
    { key: "claude", label: "claude" },
    { key: "codex", label: "codex" },
    { key: "kimi", label: "kimi" },
    { key: "gemini", label: "gemini" },
    { key: "copilot", label: "copilot" },
    { key: "factory", label: "factory" },
    { key: "opencode", label: "opencode" },
    { key: "aider", label: "aider" },
    { key: "continue", label: "continue" },
    { key: "cursor", label: "cursor" },
  ];
  const srcBadges = allBadges.filter(b => activeSources.has(b.key));

  return (
    <div
      className="sidebar"
      ref={sidebarRef}
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
    >
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <Logo />
          <span className="sidebar-count">{sessions.length}</span>
        </div>

        <div className="search-wrap">
          <span className="search-icon"><SearchIcon /></span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search sessions (2+ chars: full-text)"
            autoComplete="off"
            spellCheck={false}
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLocalSearch("");
                setSearchQuery("");
                setFtResults([]);
                setFtActive(false);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                if (ftSearchRef.current) clearTimeout(ftSearchRef.current);
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
                checked={sourceFilters[key] !== false}
                onChange={() => toggleSourceFilter(key)}
              />
              <span
                className={`source-filter-label ${sourceFilters[key] !== false ? "active" : "inactive"}`}
                data-source={key}
              >
                {label}
              </span>
            </label>
          ))}
        </div>

        {/* Browse / Starred / Pinned / Archived / Analytics tabs */}
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${sidebarTab === "browse" ? "active" : ""}`}
            onClick={() => setSidebarTab("browse")}
          >browse</button>
          <button
            className={`sidebar-tab ${sidebarTab === "favourites" ? "active" : ""}`}
            onClick={() => setSidebarTab("favourites")}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" style={{ marginRight: 3, verticalAlign: -1 }}>
              <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"
                fill={sidebarTab === "favourites" ? "#F59E0B" : "none"}
                stroke={sidebarTab === "favourites" ? "#F59E0B" : "currentColor"}
                strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            favourites
            {starredSessionIds.size > 0 && (
              <span className="sidebar-tab-count">{starredSessionIds.size}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === "pinned" ? "active" : ""}`}
            onClick={() => setSidebarTab("pinned")}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ marginRight: 3, verticalAlign: -1 }}>
              <path d="M5 17H19V13L17 5H7L5 13V17Z"
                fill={sidebarTab === "pinned" ? "#9B72EF" : "none"}
                stroke={sidebarTab === "pinned" ? "#9B72EF" : "currentColor"}
                strokeWidth="1.4" strokeLinejoin="round"/>
              <line x1="5" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            pinned
            {Object.values(pinnedBlocks).filter(v => v.length > 0).length > 0 && (
              <span className="sidebar-tab-count">{Object.values(pinnedBlocks).filter(v => v.length > 0).length}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === "archived" ? "active" : ""}`}
            onClick={() => setSidebarTab("archived")}
          >
            archived
            {archivedSessionIds.size > 0 && (
              <span className="sidebar-tab-count">{archivedSessionIds.size}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === "analytics" ? "active" : ""}`}
            onClick={() => setSidebarTab("analytics")}
          >analytics</button>
        </div>
      </div>

      {settingsOpen ? (
        <SettingsPanel />
      ) : ftActive ? (
        <div className="session-list scroller">
          {ftLoading ? (
            <div className="session-list-empty">
              <div className="spinner" style={{ width: 12, height: 12 }} /> Searching&hellip;
            </div>
          ) : ftResults.length === 0 ? (
            <div className="session-list-empty">No content matches</div>
          ) : (
            ftResults.map(({ session: s, snippet }) => {
              const src = s.source || "kova";
              return (
                <div
                  key={s.sessionId}
                  className={`session-item ft-result ${currentSessionId === s.sessionId ? "selected" : ""}`}
                  onClick={() => handleSelect(s.sessionId)}
                >
                  <div className="session-row">
                    <div className={`session-dot ${s.isActive ? "active" : "inactive"}`} />
                    <span className="session-label">{sessionLabel(s)}</span>
                    <span className="session-source" style={{ color: sourceColors[src] || "var(--text-2)" }}>{src}</span>
                  </div>
                  <div className="ft-snippet">{snippet}</div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="session-list scroller">
          {filteredSessions.length === 0 ? (
            <div className="session-list-empty">
              {searchQuery ? "No matches" : sidebarTab === "archived" ? "No archived sessions" : sidebarTab === "favourites" ? "No favourite sessions" : sidebarTab === "pinned" ? "No sessions with pinned blocks" : "No sessions"}
            </div>
          ) : (
            filteredSessions.map((s) => {
              if (childIds.has(s.sessionId)) return null;
              // Tab-specific filters
              if (sidebarTab === "favourites" && !starredSessionIds.has(s.sessionId)) return null;
              if (sidebarTab === "pinned" && !(pinnedBlocks[s.sessionId]?.length > 0)) return null;
              const children = childrenOf.get(s.sessionId) || [];
              const isExpanded = expandedGroups.has(s.sessionId);
              const isLive = activeSessions.has(s.sessionId);
              const isArchived = archivedSessionIds.has(s.sessionId);

              return (
                <div key={s.sessionId}>
                  <SessionItem
                    session={s}
                    isSubagent={false}
                    childCount={children.length}
                    hasSubagents={hasSubagentsSet.has(s.sessionId)}
                    isExpanded={isExpanded}
                    isSelected={currentSessionId === s.sessionId}
                    isChecked={selectedIds.has(s.sessionId)}
                    anyChecked={selectedIds.size > 0}
                    isLive={isLive}
                    isArchived={isArchived}
                    isStarred={starredSessionIds.has(s.sessionId)}
                    compact={compactSidebar}
                    onSelect={handleSelect}
                    onToggleExpand={toggleGroupExpanded}
                    onContextMenu={handleContextMenu}
                    onToggleStar={toggleStarred}
                    onCheck={handleCheck}
                  />
                  {children.length > 0 && isExpanded && (() => {
                    // Group children by teamName
                    const teamGroups = new Map<string, typeof children>();
                    const ungrouped: typeof children = [];
                    for (const c of children) {
                      const tn = c.teamName;
                      if (tn) {
                        if (!teamGroups.has(tn)) teamGroups.set(tn, []);
                        teamGroups.get(tn)!.push(c);
                      } else {
                        ungrouped.push(c);
                      }
                    }
                    const hasTeams = teamGroups.size > 0;

                    const renderChild = (c: typeof children[0]) => (
                      <SessionItem
                        key={c.sessionId}
                        session={c}
                        isSubagent={true}
                        childCount={0}
                        hasSubagents={hasSubagentsSet.has(c.sessionId)}
                        isExpanded={false}
                        isSelected={currentSessionId === c.sessionId}
                        isChecked={selectedIds.has(c.sessionId)}
                        anyChecked={selectedIds.size > 0}
                        isLive={activeSessions.has(c.sessionId)}
                        isArchived={archivedSessionIds.has(c.sessionId)}
                        isStarred={starredSessionIds.has(c.sessionId)}
                        compact={compactSidebar}
                        onSelect={handleSelect}
                        onToggleExpand={toggleGroupExpanded}
                        onContextMenu={handleContextMenu}
                        onToggleStar={toggleStarred}
                        onCheck={handleCheck}
                      />
                    );

                    const renderTeamGroup = (groupName: string, members: typeof children, isDirectGroup = false) => {
                      const teamKey = `${s.sessionId}::${groupName}`;
                      const isCollapsed = collapsedTeams.has(teamKey);
                      const hasActive = members.some(c => currentSessionId === c.sessionId);
                      return (
                        <div key={groupName} className={`team-group${isDirectGroup ? " team-group-direct" : ""}`}>
                          <button
                            className={`team-group-header${hasActive ? " has-active" : ""}`}
                            onClick={() => toggleTeam(s.sessionId, groupName)}
                          >
                            <svg
                              width="8" height="8" viewBox="0 0 8 8" fill="none"
                              style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
                            >
                              <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="team-group-name">{groupName}</span>
                            <span className="team-group-count">{members.length}</span>
                            {hasActive && <span className="team-group-active-dot" />}
                          </button>
                          {!isCollapsed && (
                            <div className="team-group-members">
                              {members.map(renderChild)}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div className={`subagent-children${hasTeams ? " has-teams" : ""}`}>
                        {Array.from(teamGroups.entries()).map(([teamName, members]) =>
                          renderTeamGroup(teamName, members)
                        )}
                        {ungrouped.length > 0 && hasTeams && renderTeamGroup("direct", ungrouped, true)}
                        {ungrouped.length > 0 && !hasTeams && ungrouped.map(renderChild)}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          session={ctxMenu.session}
          isArchived={archivedSessionIds.has(ctxMenu.session.sessionId)}
          selectedCount={
            selectedIds.has(ctxMenu.session.sessionId) ? selectedIds.size : 1
          }
          onClose={() => setCtxMenu(null)}
          onDelete={handleDelete}
        />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selectedIds.size} selected</span>
          <button
            className="bulk-bar-btn bulk-bar-danger"
            onClick={() => { deleteSessions([...selectedIds]); setSelectedIds(new Set()); }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L13 4"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete
          </button>
          <button
            className="bulk-bar-btn"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Footer: expand/collapse all + settings */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-group">
          <button
            className="sidebar-footer-btn"
            onClick={expandAllGroups}
            title="Expand all subagent groups"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 2h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>expand all</span>
          </button>
          <button
            className="sidebar-footer-btn"
            onClick={collapseAllGroups}
            title="Collapse all subagent groups"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 11l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 14h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>collapse all</span>
          </button>
        </div>
        <button
          className={`sidebar-settings-btn ${settingsOpen ? "active" : ""}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings"
        >
          <GearIcon />
          <span>settings</span>
        </button>
        <button
          className="sidebar-settings-btn"
          onClick={() => { window.location.href = "/?setup=1"; }}
          title="Configure agent paths"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>agents</span>
        </button>
      </div>

      {/* Drag handle */}
      <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />
    </div>
  );
}

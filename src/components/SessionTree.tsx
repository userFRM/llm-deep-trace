"use client";

import React, { useMemo } from "react";
import { NormalizedMessage } from "@/lib/types";
import { SessionInfo } from "@/lib/types";

// ── Agent type colors ──────────────────────────────────────────────────────

const agentColors: Record<string, string> = {
  kova:     "#9B72EF",
  claude:   "#9B72EF",
  codex:    "#22C55E",
  kimi:     "#F59E0B",
  gemini:   "#3B82F6",
  opencode: "#14B8A6",
  aider:    "#EC4899",
  continue: "#8B5CF6",
  cursor:   "#6366F1",
  copilot:  "#64748B",
};

function agentColor(source?: string): string {
  return agentColors[source || "kova"] || "#9B72EF";
}

// ── Types ─────────────────────────────────────────────────────────────────

interface SessionTreeProps {
  messages: NormalizedMessage[];      // kept for API compat, not used
  sessionId: string;                  // map root (parent session)
  sessionLabel: string;
  allSessions: SessionInfo[];
  highlightSessionId?: string;        // currently active session
  onScrollToMessage: (idx: number) => void;  // kept for API compat
  onNavigateSession: (keyOrId: string) => void;
  onClose: () => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AgentDot({ source, size = 8 }: { source?: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: agentColor(source),
        flexShrink: 0,
      }}
    />
  );
}

interface NodeCardProps {
  session: SessionInfo;
  isActive: boolean;
  isRoot?: boolean;
  isLive?: boolean;
  onClick: () => void;
}

function NodeCard({ session, isActive, isRoot, isLive, onClick }: NodeCardProps) {
  const color = agentColor(session.source);
  const label = session.label || session.sessionId.slice(0, 20);

  return (
    <button
      className={`map-node${isActive ? " map-node-active" : ""}${isRoot ? " map-node-root" : ""}`}
      style={isActive ? { borderColor: color, boxShadow: `0 0 0 1px ${color}44, 0 0 10px 0 ${color}22` } : undefined}
      onClick={onClick}
      title={label}
    >
      <AgentDot source={session.source} size={isRoot ? 9 : 7} />
      <span className="map-node-label">{label}</span>
      {isLive && <span className="map-node-live" />}
      {isActive && !isRoot && (
        <span className="map-node-you">you</span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SessionTree({
  sessionId,
  sessionLabel,
  allSessions,
  highlightSessionId,
  onNavigateSession,
  onClose,
}: SessionTreeProps) {
  // Root session
  const rootSession = useMemo(
    () => allSessions.find(s => s.sessionId === sessionId) || {
      sessionId,
      label: sessionLabel,
      source: "claude",
      key: sessionId,
      lastUpdated: 0,
      channel: "",
      chatType: "",
      messageCount: 0,
      preview: "",
      isActive: true,
      isDeleted: false,
      isSubagent: false,
      compactionCount: 0,
    } as SessionInfo,
    [allSessions, sessionId, sessionLabel]
  );

  // Direct children of the root
  const children = useMemo(
    () => allSessions
      .filter(s => s.parentSessionId === sessionId)
      .sort((a, b) => a.lastUpdated - b.lastUpdated),
    [allSessions, sessionId]
  );

  // Group children by teamName
  const { teamGroups, ungrouped } = useMemo(() => {
    const groups = new Map<string, SessionInfo[]>();
    const direct: SessionInfo[] = [];
    for (const c of children) {
      if (c.teamName) {
        if (!groups.has(c.teamName)) groups.set(c.teamName, []);
        groups.get(c.teamName)!.push(c);
      } else {
        direct.push(c);
      }
    }
    return { teamGroups: groups, ungrouped: direct };
  }, [children]);

  const hasTeams = teamGroups.size > 0;

  // Active sessions
  const activeIds = useMemo(
    () => new Set(allSessions.filter(s => s.isActive).map(s => s.sessionId)),
    [allSessions]
  );

  const isRootActive = highlightSessionId === sessionId;

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation Map</span>
        <button className="tree-panel-close" onClick={onClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="map-body">
        {/* Root node */}
        <div className="map-root-row">
          <NodeCard
            session={rootSession}
            isActive={isRootActive}
            isRoot
            isLive={activeIds.has(sessionId)}
            onClick={() => onNavigateSession(sessionId)}
          />
        </div>

        {children.length === 0 && (
          <div className="map-empty">no subagents</div>
        )}

        {children.length > 0 && (
          <div className="map-children">
            {/* Team groups */}
            {Array.from(teamGroups.entries()).map(([teamName, members]) => (
              <div key={teamName} className="map-team">
                <div className="map-team-label">
                  <span className="map-team-name">{teamName}</span>
                  <span className="map-team-count">{members.length}</span>
                </div>
                <div className="map-team-members">
                  {members.map(c => (
                    <div key={c.sessionId} className="map-child-row">
                      <NodeCard
                        session={c}
                        isActive={highlightSessionId === c.sessionId}
                        isLive={activeIds.has(c.sessionId)}
                        onClick={() => onNavigateSession(c.sessionId)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Ungrouped direct subagents */}
            {ungrouped.length > 0 && (
              <div className={hasTeams ? "map-team" : ""}>
                {hasTeams && (
                  <div className="map-team-label">
                    <span className="map-team-name">direct</span>
                    <span className="map-team-count">{ungrouped.length}</span>
                  </div>
                )}
                <div className={hasTeams ? "map-team-members" : ""}>
                  {ungrouped.map(c => (
                    <div key={c.sessionId} className="map-child-row">
                      <NodeCard
                        session={c}
                        isActive={highlightSessionId === c.sessionId}
                        isLive={activeIds.has(c.sessionId)}
                        onClick={() => onNavigateSession(c.sessionId)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

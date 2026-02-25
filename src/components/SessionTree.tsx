"use client";

import React, { useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NormalizedMessage, SessionInfo } from "@/lib/types";

// ── Layout constants ────────────────────────────────────────────────────────

const ROOT_W      = 190;
const ROOT_H      = 48;
const SUB_W       = 168;
const SUB_H       = 34;
const TEAM_W      = 152;
const TEAM_H      = 26;
const HDR_H       = 28;   // project column header
const H_GAP       = 22;   // horizontal gap between levels
const V_GAP       = 6;    // vertical gap between siblings
const TREE_GAP    = 16;   // extra vertical gap between root trees in same project
const PROJECT_GAP = 40;   // horizontal gap between project columns

// ── Agent colors ────────────────────────────────────────────────────────────

const agentColors: Record<string, string> = {
  kova: "#9B72EF", claude: "#9B72EF", codex: "#22C55E",
  kimi: "#F59E0B", gemini: "#3B82F6", opencode: "#14B8A6",
  aider: "#EC4899", continue: "#8B5CF6", cursor: "#6366F1", copilot: "#64748B",
};
const agentColor = (src?: string) => agentColors[src || "kova"] ?? "#9B72EF";

// ── Node data types ─────────────────────────────────────────────────────────

interface RootData extends Record<string, unknown> {
  kind: "root"; sessionId: string; label: string; source: string;
  msgCount: number; isHighlighted: boolean; isLive: boolean; accentColor: string;
}
interface SubData extends Record<string, unknown> {
  kind: "sub"; sessionId: string; label: string; source: string;
  isHighlighted: boolean; isLive: boolean; accentColor: string; isSidechain: boolean;
}
interface TeamData extends Record<string, unknown> {
  kind: "team"; teamName: string; memberCount: number;
}
interface ProjectData extends Record<string, unknown> {
  kind: "project"; name: string; sessionCount: number;
}

type RootNode    = Node<RootData,    "rootNode">;
type SubNode     = Node<SubData,     "subNode">;
type TeamNode    = Node<TeamData,    "teamNode">;
type ProjectNode = Node<ProjectData, "projectNode">;
type AnyNode     = RootNode | SubNode | TeamNode | ProjectNode;

// ── Node components ─────────────────────────────────────────────────────────

function RootNodeComp({ data }: NodeProps<RootNode>) {
  const c = data.accentColor;
  return (
    <>
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0, width: 1, height: 1 }} />
      <div className={`gn-root${data.isHighlighted ? " gn-root-active" : ""}`}
        style={{ borderLeftColor: c, ...(data.isHighlighted ? { boxShadow: `0 0 0 1px ${c}44, 0 0 10px ${c}28` } : {}) }}>
        <div className="gn-root-top">
          <span className="gn-src-badge" style={{ color: c, borderColor: `${c}44` }}>{data.source}</span>
          {data.msgCount > 0 && <span className="gn-msg-count">{data.msgCount}</span>}
          {data.isLive && <span className="gn-live-dot" />}
        </div>
        <div className="gn-root-label" title={data.label}>{(data.label || data.sessionId).slice(0, 28)}</div>
      </div>
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

function SubNodeComp({ data }: NodeProps<SubNode>) {
  const c = data.accentColor;
  return (
    <>
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0, width: 1, height: 1 }} />
      <div className={`gn-sub${data.isHighlighted ? " gn-sub-active" : ""}`}
        style={data.isHighlighted ? { borderColor: c, boxShadow: `0 0 0 1px ${c}44` } : undefined}>
        <span className="gn-sub-dot" style={{ background: c }} />
        <span className="gn-sub-label" title={data.label}>{(data.label || data.sessionId).slice(0, 26)}</span>
        <span className={`gn-badge ${data.isSidechain ? "gn-badge-team" : "gn-badge-sub"}`}>
          {data.isSidechain ? "team" : "agent"}
        </span>
        {data.isLive && <span className="gn-live-dot" />}
      </div>
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

function TeamNodeComp({ data }: NodeProps<TeamNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0, width: 1, height: 1 }} />
      <div className="gn-team">
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="5" cy="4" r="2" stroke="#F59E0B" strokeWidth="1.2"/>
          <circle cx="9" cy="4" r="2" stroke="#F59E0B" strokeWidth="1.2"/>
          <path d="M1 12c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span className="gn-team-name">{data.teamName}</span>
        <span className="gn-team-count">{data.memberCount}</span>
      </div>
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

function ProjectNodeComp({ data }: NodeProps<ProjectNode>) {
  return (
    <div className="gn-project-hdr">
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
        <rect x="1" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M1 7h12" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
        <path d="M4 4V2.5A1.5 1.5 0 015.5 1h3A1.5 1.5 0 0110 2.5V4" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
      <span className="gn-project-name">{data.name}</span>
      <span className="gn-project-count">{data.sessionCount}</span>
    </div>
  );
}

const nodeTypes = {
  rootNode:    RootNodeComp,
  subNode:     SubNodeComp,
  teamNode:    TeamNodeComp,
  projectNode: ProjectNodeComp,
};

// ── Layout ──────────────────────────────────────────────────────────────────

function projectKey(s: SessionInfo): string {
  if (s.cwd) {
    const parts = s.cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] || "workspace";
  }
  if (s.source && s.source !== "claude") return s.source;
  return "other";
}

function buildGraph(
  sessions: SessionInfo[],
  activeSessions: Set<string>,
  highlightId: string | null
): { nodes: AnyNode[]; edges: Edge[] } {
  if (!sessions.length) return { nodes: [], edges: [] };

  // ── Index and build parent→children map ────────────────────────────────
  const byId = new Map(sessions.map(s => [s.sessionId, s]));
  const childrenOf = new Map<string, SessionInfo[]>();

  for (const s of sessions) {
    if (s.parentSessionId && byId.has(s.parentSessionId)) {
      const arr = childrenOf.get(s.parentSessionId) ?? [];
      arr.push(s);
      childrenOf.set(s.parentSessionId, arr);
    }
  }
  for (const [, ch] of childrenOf) ch.sort((a, b) => a.lastUpdated - b.lastUpdated);

  // Only root sessions go into project columns
  const rootSessions = sessions.filter(s => !s.parentSessionId || !byId.has(s.parentSessionId));

  // ── Group roots by project ──────────────────────────────────────────────
  const projectMap = new Map<string, SessionInfo[]>();
  for (const s of rootSessions) {
    const key = projectKey(s);
    const arr = projectMap.get(key) ?? [];
    arr.push(s);
    projectMap.set(key, arr);
  }
  // Sort projects by most recently updated session
  const projects = [...projectMap.entries()].sort((a, b) => {
    const aLast = Math.max(...a[1].map(s => s.lastUpdated));
    const bLast = Math.max(...b[1].map(s => s.lastUpdated));
    return bLast - aLast;
  });
  // Sort roots within each project by most recent first
  for (const [, roots] of projects) roots.sort((a, b) => b.lastUpdated - a.lastUpdated);

  // ── Height calculation ──────────────────────────────────────────────────
  function teamH(members: SessionInfo[]): number {
    if (!members.length) return 0;
    return TEAM_H + V_GAP + members.reduce((s, _, i) => s + SUB_H + (i < members.length - 1 ? V_GAP : 0), 0);
  }

  function subtreeH(rootId: string): number {
    const children = childrenOf.get(rootId) ?? [];
    const direct = children.filter(c => !c.isSidechain);
    const byTeam = new Map<string, SessionInfo[]>();
    for (const c of children) {
      if (c.isSidechain && c.teamName) {
        const arr = byTeam.get(c.teamName) ?? [];
        arr.push(c);
        byTeam.set(c.teamName, arr);
      } else if (!c.isSidechain && c.teamName) {
        direct.push(c);
      }
    }
    const items = [...direct.map(() => SUB_H), ...[...byTeam.keys()].map(tn => teamH(byTeam.get(tn)!))];
    if (!items.length) return ROOT_H;
    return Math.max(ROOT_H, items.reduce((s, h, i) => s + h + (i < items.length - 1 ? V_GAP : 0), 0));
  }

  function projectH(roots: SessionInfo[]): number {
    return HDR_H + V_GAP + roots.reduce((s, r, i) =>
      s + subtreeH(r.sessionId) + (i < roots.length - 1 ? TREE_GAP : 0), 0
    );
  }

  // Widest a tree can be in this project (determines column width)
  function treeDepth(rootId: string): number {
    const children = childrenOf.get(rootId) ?? [];
    if (!children.length) return 1;
    const hasSidechain = children.some(c => c.isSidechain);
    return hasSidechain ? 3 : 2; // root + sub [+ team member]
  }

  function projectW(roots: SessionInfo[]): number {
    const depth = Math.max(...roots.map(r => treeDepth(r.sessionId)), 1);
    if (depth === 1) return ROOT_W;
    if (depth === 2) return ROOT_W + H_GAP + SUB_W;
    return ROOT_W + H_GAP + TEAM_W + H_GAP + SUB_W;
  }

  // ── Place nodes ─────────────────────────────────────────────────────────
  const nodes: AnyNode[] = [];
  const edges: Edge[] = [];
  let cx = 0;

  for (const [projectName, roots] of projects) {
    const colW = projectW(roots);
    const totalSessions = roots.length + roots.reduce((s, r) =>
      s + (childrenOf.get(r.sessionId)?.length ?? 0), 0
    );

    // Project header
    nodes.push({
      id: `proj:${projectName}`,
      type: "projectNode",
      position: { x: cx, y: 0 },
      data: { kind: "project", name: projectName, sessionCount: totalSessions },
      style: { width: colW, height: HDR_H },
      selectable: false,
      draggable: false,
    } as ProjectNode);

    let cy = HDR_H + V_GAP;

    for (const root of roots) {
      const color = agentColor(root.source);
      const children = childrenOf.get(root.sessionId) ?? [];
      const direct = children.filter(c => !c.isSidechain);
      const byTeam = new Map<string, SessionInfo[]>();
      for (const c of children) {
        if (c.isSidechain && c.teamName) {
          const arr = byTeam.get(c.teamName) ?? [];
          arr.push(c);
          byTeam.set(c.teamName, arr);
        } else if (!c.isSidechain && c.teamName) {
          direct.push(c);
        }
      }
      const teamNames = [...byTeam.keys()];
      const allItems = [...direct.map(() => SUB_H), ...teamNames.map(tn => teamH(byTeam.get(tn)!))];
      const totalH   = allItems.length
        ? allItems.reduce((s, h, i) => s + h + (i < allItems.length - 1 ? V_GAP : 0), 0)
        : ROOT_H;
      const rootY = cy + (totalH - ROOT_H) / 2;

      nodes.push({
        id: root.sessionId,
        type: "rootNode",
        position: { x: cx, y: rootY },
        data: {
          kind: "root", sessionId: root.sessionId,
          label: root.label || "",
          source: root.source || "kova",
          msgCount: root.messageCount || 0,
          isHighlighted: root.sessionId === highlightId,
          isLive: activeSessions.has(root.sessionId),
          accentColor: color,
        },
        style: { width: ROOT_W, height: ROOT_H },
      } as RootNode);

      const x1 = cx + ROOT_W + H_GAP;
      let itemY = cy;

      // Direct subagents
      for (const sub of direct) {
        nodes.push({
          id: sub.sessionId, type: "subNode",
          position: { x: x1, y: itemY },
          data: {
            kind: "sub", sessionId: sub.sessionId,
            label: sub.label || "",
            source: sub.source || "kova",
            isHighlighted: sub.sessionId === highlightId,
            isLive: activeSessions.has(sub.sessionId),
            accentColor: agentColor(sub.source),
            isSidechain: false,
          },
          style: { width: SUB_W, height: SUB_H },
        } as SubNode);
        edges.push({
          id: `${root.sessionId}→${sub.sessionId}`,
          source: root.sessionId, sourceHandle: "right",
          target: sub.sessionId, targetHandle: "left",
          type: "smoothstep",
          style: { stroke: "#2a2a38", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#2a2a38" },
        });
        itemY += SUB_H + V_GAP;
      }

      // Team clusters
      for (const tn of teamNames) {
        const members = byTeam.get(tn)!;
        const tId = `team:${root.sessionId}::${tn}`;
        const clH = teamH(members);
        const teamY = itemY + (clH - TEAM_H) / 2;

        nodes.push({
          id: tId, type: "teamNode",
          position: { x: x1, y: teamY },
          data: { kind: "team", teamName: tn, memberCount: members.length },
          style: { width: TEAM_W, height: TEAM_H },
        } as TeamNode);
        edges.push({
          id: `${root.sessionId}→${tId}`,
          source: root.sessionId, sourceHandle: "right",
          target: tId, targetHandle: "left",
          type: "smoothstep",
          style: { stroke: "#F59E0B66", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#F59E0B66" },
        });

        const x2 = x1 + TEAM_W + H_GAP;
        let my = itemY + TEAM_H + V_GAP;
        for (const m of members) {
          nodes.push({
            id: m.sessionId, type: "subNode",
            position: { x: x2, y: my },
            data: {
              kind: "sub", sessionId: m.sessionId,
              label: m.label || "",
              source: m.source || "kova",
              isHighlighted: m.sessionId === highlightId,
              isLive: activeSessions.has(m.sessionId),
              accentColor: agentColor(m.source),
              isSidechain: true,
            },
            style: { width: SUB_W, height: SUB_H },
          } as SubNode);
          edges.push({
            id: `${tId}→${m.sessionId}`,
            source: tId, sourceHandle: "right",
            target: m.sessionId, targetHandle: "left",
            type: "smoothstep",
            style: { stroke: "#F59E0B44", strokeWidth: 1, strokeDasharray: "4 3" },
          });
          my += SUB_H + V_GAP;
        }
        itemY += clH + V_GAP;
      }

      cy += totalH + TREE_GAP;
    }

    cx += colW + PROJECT_GAP;
  }

  return { nodes, edges };
}

// ── Inner flow ──────────────────────────────────────────────────────────────

function InnerFlow({
  sessions, activeSessions, currentSessionId, onNavigateSession, onResetView,
}: {
  sessions: SessionInfo[];
  activeSessions: Set<string>;
  currentSessionId: string | null;
  onNavigateSession: (id: string) => void;
  onResetView?: (fn: () => void) => void;
}) {
  const { setCenter, getNode, fitView } = useReactFlow();
  const prevHighlight = useRef<string | null>(null);

  const { nodes, edges } = useMemo(
    () => buildGraph(sessions, activeSessions, currentSessionId),
    [sessions, activeSessions, currentSessionId]
  );

  // Pan to active node at readable zoom when selection changes
  useEffect(() => {
    if (!currentSessionId || currentSessionId === prevHighlight.current) return;
    prevHighlight.current = currentSessionId;
    const t = setTimeout(() => {
      const node = getNode(currentSessionId);
      if (node) {
        const w = (node.style?.width as number) || ROOT_W;
        const h = (node.style?.height as number) || ROOT_H;
        setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1.1, duration: 380 });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [currentSessionId, getNode, setCenter]);

  useEffect(() => {
    if (onResetView) onResetView(() => fitView({ duration: 400, padding: 0.08 }));
  }, [fitView, onResetView]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as { kind: string; sessionId?: string };
    if (d.kind === "team" || d.kind === "project") return;
    if (d.sessionId) onNavigateSession(d.sessionId);
  }, [onNavigateSession]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      // Start zoomed out enough to see multiple projects, let setCenter handle focus
      defaultViewport={{ x: 0, y: 0, zoom: 0.35 }}
      minZoom={0.04}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      zoomOnScroll
      className="session-graph-flow"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a24" />
      <MiniMap
        nodeColor={(node) => {
          const d = node.data as { kind: string; accentColor?: string };
          if (d.kind === "project") return "#ffffff11";
          if (d.kind === "team") return "#F59E0B44";
          return (d.accentColor as string) || "#9B72EF";
        }}
        nodeStrokeWidth={0}
        style={{ background: "#0D0D0F", border: "1px solid #1E1E24", borderRadius: "6px" }}
        maskColor="rgba(0,0,0,0.55)"
        zoomable pannable
      />
    </ReactFlow>
  );
}

// ── Public component ────────────────────────────────────────────────────────

interface SessionTreeProps {
  messages: NormalizedMessage[];
  sessionId: string;
  sessionLabel: string;
  highlightSessionId?: string;
  allSessions: SessionInfo[];
  activeSessions?: Set<string>;
  onScrollToMessage: (idx: number) => void;
  onNavigateSession: (keyOrId: string) => void;
  onClose: () => void;
}

export default function SessionTree({
  allSessions, activeSessions, highlightSessionId, onNavigateSession, onClose,
}: SessionTreeProps) {
  const resetViewRef = useRef<(() => void) | null>(null);
  const activeSet = useMemo(() => activeSessions || new Set<string>(), [activeSessions]);

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation map</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="tree-panel-close" onClick={() => resetViewRef.current?.()} title="Fit all">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </button>
          <button className="tree-panel-close" onClick={onClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="tree-panel-body">
        <ReactFlowProvider>
          <InnerFlow
            sessions={allSessions}
            activeSessions={activeSet}
            currentSessionId={highlightSessionId || null}
            onNavigateSession={onNavigateSession}
            onResetView={(fn) => { resetViewRef.current = fn; }}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

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

// ── Sizing constants ───────────────────────────────────────────────────────

const ROOT_W   = 204;
const ROOT_H   = 52;
const SUB_W    = 180;
const SUB_H    = 38;
const TEAM_W   = 164;
const TEAM_H   = 28;
const H_GAP    = 32;   // horizontal gap between levels
const V_GAP    = 8;    // gap between siblings
const TREE_GAP = 48;   // gap between separate root trees

// ── Agent / team colors ────────────────────────────────────────────────────

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
  return agentColors[source || "kova"] ?? "#9B72EF";
}

// ── Node data types ────────────────────────────────────────────────────────

interface RootNodeData extends Record<string, unknown> {
  kind: "root";
  sessionId: string;
  label: string;
  source: string;
  msgCount: number;
  isHighlighted: boolean;
  isLive: boolean;
  accentColor: string;
}

interface SubNodeData extends Record<string, unknown> {
  kind: "sub";
  sessionId: string;
  label: string;
  source: string;
  isHighlighted: boolean;
  isLive: boolean;
  accentColor: string;
  isSidechain: boolean;   // true = team member
}

interface TeamNodeData extends Record<string, unknown> {
  kind: "team";
  teamName: string;
  memberCount: number;
}

type RootNodeType = Node<RootNodeData, "rootNode">;
type SubNodeType  = Node<SubNodeData,  "subNode">;
type TeamNodeType = Node<TeamNodeData, "teamNode">;
type AnyNode = RootNodeType | SubNodeType | TeamNodeType;

// ── Root node component ────────────────────────────────────────────────────

function RootNodeComponent({ data }: NodeProps<RootNodeType>) {
  const color = data.accentColor;
  const src   = data.source ?? "kova";
  const label = data.label ? data.label.slice(0, 32) : data.sessionId.slice(0, 20);

  return (
    <>
      <Handle type="target" position={Position.Left} id="left"
        style={{ opacity: 0, width: 1, height: 1 }} />
      <div
        className={`gn-root${data.isHighlighted ? " gn-root-active" : ""}`}
        style={{ borderLeftColor: color,
          ...(data.isHighlighted ? { boxShadow: `0 0 0 1px ${color}44, 0 0 10px ${color}28` } : undefined)
        }}
      >
        <div className="gn-root-top">
          <span className="gn-src-badge" style={{ color, borderColor: `${color}44` }}>{src}</span>
          {data.msgCount > 0 && (
            <span className="gn-msg-count">{data.msgCount}</span>
          )}
          {data.isLive && <span className="gn-live-dot" />}
        </div>
        <div className="gn-root-label" title={data.label}>{label}</div>
      </div>
      <Handle type="source" position={Position.Right} id="right"
        style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

// ── Subagent node component ────────────────────────────────────────────────

function SubNodeComponent({ data }: NodeProps<SubNodeType>) {
  const color = data.accentColor;
  const label = data.label ? data.label.slice(0, 30) : data.sessionId.slice(0, 18);

  return (
    <>
      <Handle type="target" position={Position.Left} id="left"
        style={{ opacity: 0, width: 1, height: 1 }} />
      <div
        className={`gn-sub${data.isHighlighted ? " gn-sub-active" : ""}`}
        style={data.isHighlighted ? { borderColor: color, boxShadow: `0 0 0 1px ${color}44` } : undefined}
      >
        <span className="gn-sub-dot" style={{ background: color }} />
        <span className="gn-sub-label" title={data.label}>{label}</span>
        {data.isSidechain
          ? <span className="gn-badge gn-badge-team">team</span>
          : <span className="gn-badge gn-badge-sub">agent</span>
        }
        {data.isLive && <span className="gn-live-dot" />}
      </div>
      <Handle type="source" position={Position.Right} id="right"
        style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

// ── Team header node component (not a session — just grouping) ─────────────

function TeamNodeComponent({ data }: NodeProps<TeamNodeType>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id="left"
        style={{ opacity: 0, width: 1, height: 1 }} />
      <div className="gn-team">
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="5" cy="4" r="2" stroke="#F59E0B" strokeWidth="1.2"/>
          <circle cx="9" cy="4" r="2" stroke="#F59E0B" strokeWidth="1.2"/>
          <path d="M1 12c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span className="gn-team-name">{data.teamName}</span>
        <span className="gn-team-count">{data.memberCount}</span>
      </div>
      <Handle type="source" position={Position.Right} id="right"
        style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

const nodeTypes = {
  rootNode: RootNodeComponent,
  subNode:  SubNodeComponent,
  teamNode: TeamNodeComponent,
};

// ── Layout ─────────────────────────────────────────────────────────────────

function buildGraph(
  sessions: SessionInfo[],
  activeSessions: Set<string>,
  highlightId: string | null
): { nodes: AnyNode[], edges: Edge[] } {
  if (!sessions.length) return { nodes: [], edges: [] };

  const byId   = new Map(sessions.map(s => [s.sessionId, s]));
  const childrenOf = new Map<string, SessionInfo[]>();
  const roots: SessionInfo[] = [];

  for (const s of sessions) {
    const validParent = s.parentSessionId && byId.has(s.parentSessionId);
    if (validParent) {
      const pid = s.parentSessionId!;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(s);
    } else {
      roots.push(s);
    }
  }

  roots.sort((a, b) => b.lastUpdated - a.lastUpdated);
  for (const [, ch] of childrenOf) ch.sort((a, b) => a.lastUpdated - b.lastUpdated);

  const nodes: AnyNode[] = [];
  const edges: Edge[] = [];

  // ── Height calculations ──────────────────────────────────────────────────

  // Height of a team cluster (header + members)
  function teamH(members: SessionInfo[]): number {
    if (!members.length) return 0;
    return TEAM_H + V_GAP + members.reduce((sum, _, i) =>
      sum + SUB_H + (i < members.length - 1 ? V_GAP : 0), 0
    );
  }

  // Height of everything under a root at level-1
  function rootSubtreeH(rootId: string): number {
    const children = childrenOf.get(rootId) || [];
    const direct   = children.filter(c => !c.isSidechain);
    const byTeam   = new Map<string, SessionInfo[]>();
    for (const c of children) {
      if (c.isSidechain && c.teamName) {
        if (!byTeam.has(c.teamName)) byTeam.set(c.teamName, []);
        byTeam.get(c.teamName)!.push(c);
      }
    }
    const teamNames = [...byTeam.keys()];

    const items: number[] = [
      ...direct.map(() => SUB_H),
      ...teamNames.map(tn => teamH(byTeam.get(tn)!)),
    ];

    if (!items.length) return ROOT_H;
    return Math.max(ROOT_H, items.reduce((sum, h, i) =>
      sum + h + (i < items.length - 1 ? V_GAP : 0), 0
    ));
  }

  // ── Placement ────────────────────────────────────────────────────────────

  function placeRoot(root: SessionInfo, topY: number) {
    const color    = agentColor(root.source);
    const children = childrenOf.get(root.sessionId) || [];
    const direct   = children.filter(c => !c.isSidechain);
    const byTeam   = new Map<string, SessionInfo[]>();
    for (const c of children) {
      if (c.isSidechain && c.teamName) {
        if (!byTeam.has(c.teamName)) byTeam.set(c.teamName, []);
        byTeam.get(c.teamName)!.push(c);
      } else if (!c.isSidechain && c.teamName) {
        // team-spawned but isSidechain flag not set — treat as direct
        direct.push(c);
      }
    }
    const teamNames = [...byTeam.keys()];

    // Compute heights
    const directHs = direct.map(() => SUB_H);
    const teamHs   = teamNames.map(tn => teamH(byTeam.get(tn)!));
    const allHs    = [...directHs, ...teamHs];
    const totalH   = allHs.length
      ? allHs.reduce((s, h, i) => s + h + (i < allHs.length - 1 ? V_GAP : 0), 0)
      : ROOT_H;

    const rootY = topY + (totalH - ROOT_H) / 2;

    nodes.push({
      id:       root.sessionId,
      type:     "rootNode",
      position: { x: 0, y: rootY },
      data: {
        kind:          "root",
        sessionId:     root.sessionId,
        label:         root.label || "",
        source:        root.source || "kova",
        msgCount:      root.messageCount || 0,
        isHighlighted: root.sessionId === highlightId,
        isLive:        activeSessions.has(root.sessionId),
        accentColor:   color,
      },
      style: { width: ROOT_W, height: ROOT_H },
    } as RootNodeType);

    // Level-1 x position (right of root)
    const x1 = ROOT_W + H_GAP;
    let cy = topY;

    // Direct subagents
    for (const sub of direct) {
      const subColor = agentColor(sub.source);
      nodes.push({
        id:       sub.sessionId,
        type:     "subNode",
        position: { x: x1, y: cy },
        data: {
          kind:          "sub",
          sessionId:     sub.sessionId,
          label:         sub.label || "",
          source:        sub.source || "kova",
          isHighlighted: sub.sessionId === highlightId,
          isLive:        activeSessions.has(sub.sessionId),
          accentColor:   subColor,
          isSidechain:   false,
        },
        style: { width: SUB_W, height: SUB_H },
      } as SubNodeType);

      edges.push({
        id:     `${root.sessionId}→${sub.sessionId}`,
        source: root.sessionId, sourceHandle: "right",
        target: sub.sessionId,  targetHandle: "left",
        type:   "smoothstep",
        style:  { stroke: "#2a2a38", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#2a2a38" },
      });

      cy += SUB_H + V_GAP;
    }

    // Team clusters
    for (const tn of teamNames) {
      const members = byTeam.get(tn)!;
      const tId     = `team:${root.sessionId}::${tn}`;
      const clH     = teamH(members);
      const teamY   = cy + (clH - TEAM_H) / 2;

      nodes.push({
        id:       tId,
        type:     "teamNode",
        position: { x: x1, y: teamY },
        data: { kind: "team", teamName: tn, memberCount: members.length },
        style: { width: TEAM_W, height: TEAM_H },
      } as TeamNodeType);

      edges.push({
        id:     `${root.sessionId}→${tId}`,
        source: root.sessionId, sourceHandle: "right",
        target: tId,            targetHandle: "left",
        type:   "smoothstep",
        style:  { stroke: "#F59E0B66", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#F59E0B66" },
      });

      // Team members at level 2
      const x2 = x1 + TEAM_W + H_GAP;
      let my = cy + TEAM_H + V_GAP;

      for (const m of members) {
        const mColor = agentColor(m.source);
        nodes.push({
          id:       m.sessionId,
          type:     "subNode",
          position: { x: x2, y: my },
          data: {
            kind:          "sub",
            sessionId:     m.sessionId,
            label:         m.label || "",
            source:        m.source || "kova",
            isHighlighted: m.sessionId === highlightId,
            isLive:        activeSessions.has(m.sessionId),
            accentColor:   mColor,
            isSidechain:   true,
          },
          style: { width: SUB_W, height: SUB_H },
        } as SubNodeType);

        edges.push({
          id:     `${tId}→${m.sessionId}`,
          source: tId,           sourceHandle: "right",
          target: m.sessionId,  targetHandle: "left",
          type:   "smoothstep",
          style:  { stroke: "#F59E0B44", strokeWidth: 1, strokeDasharray: "4 3" },
        });

        my += SUB_H + V_GAP;
      }

      cy += clH + V_GAP;
    }
  }

  let y = 0;
  for (const root of roots) {
    placeRoot(root, y);
    y += rootSubtreeH(root.sessionId) + TREE_GAP;
  }

  return { nodes, edges };
}

// ── Inner flow ─────────────────────────────────────────────────────────────

function InnerFlow({
  sessions,
  activeSessions,
  currentSessionId,
  onNavigateSession,
  onResetView,
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

  // Auto-pan to active node when selection changes
  useEffect(() => {
    if (!currentSessionId || currentSessionId === prevHighlight.current) return;
    prevHighlight.current = currentSessionId;
    const t = setTimeout(() => {
      const node = getNode(currentSessionId);
      if (node) {
        const w = (node.style?.width as number) || ROOT_W;
        const h = (node.style?.height as number) || ROOT_H;
        setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1.3, duration: 380 });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [currentSessionId, getNode, setCenter]);

  useEffect(() => {
    if (onResetView) onResetView(() => fitView({ duration: 400, padding: 0.12 }));
  }, [fitView, onResetView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const d = node.data as RootNodeData | SubNodeData | TeamNodeData;
      if (d.kind === "team") return; // team headers aren't sessions
      onNavigateSession((d as RootNodeData | SubNodeData).sessionId);
    },
    [onNavigateSession]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.15 }}
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
          if (d.kind === "team") return "#F59E0B44";
          return d.accentColor || "#9B72EF";
        }}
        nodeStrokeWidth={0}
        style={{
          background: "#0D0D0F",
          border: "1px solid #1E1E24",
          borderRadius: "6px",
        }}
        maskColor="rgba(0,0,0,0.55)"
        zoomable
        pannable
      />
    </ReactFlow>
  );
}

// ── Public component ───────────────────────────────────────────────────────

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
  allSessions,
  activeSessions,
  highlightSessionId,
  onNavigateSession,
  onClose,
}: SessionTreeProps) {
  const resetViewRef = useRef<(() => void) | null>(null);
  const activeSet    = useMemo(() => activeSessions || new Set<string>(), [activeSessions]);

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation map</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="tree-panel-close" onClick={() => resetViewRef.current?.()} title="Fit view">
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

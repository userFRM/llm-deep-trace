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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NormalizedMessage, SessionInfo } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────

const NODE_W  = 190;
const NODE_H  = 38;
const H_GAP   = 24;   // horizontal gap between parent right-edge and child left-edge
const V_GAP   = 8;    // vertical gap between sibling nodes
const TREE_GAP = 32;  // vertical gap between separate root trees

// ── Agent colors ──────────────────────────────────────────────────────────

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

// ── Node component ────────────────────────────────────────────────────────

// React Flow requires [key: string]: unknown on node data types
interface SessionNodeData extends Record<string, unknown> {
  sessionId: string;
  label?: string;
  source?: string;
  isHighlighted?: boolean;
  accentColor?: string;
  isLive?: boolean;
}

type SessionNodeType = Node<SessionNodeData, "sessionNode">;

function SessionNodeComponent({ data }: NodeProps<SessionNodeType>) {
  const color = (data.accentColor as string) || agentColor(data.source as string | undefined);
  const label = ((data.label as string) || (data.sessionId as string)).slice(0, 28);

  return (
    <>
      <Handle type="target" position={Position.Left} id="left"
        style={{ opacity: 0, width: 1, height: 1 }} />
      <div
        className={`gnode${data.isHighlighted ? " gnode-active" : ""}`}
        style={data.isHighlighted
          ? { borderColor: color, boxShadow: `0 0 0 1px ${color}55, 0 0 8px ${color}30` }
          : undefined}
      >
        <span className="gnode-dot" style={{ background: color }} />
        <span className="gnode-label" title={data.label || data.sessionId}>
          {label}
        </span>
        {data.isLive && <span className="gnode-live" />}
      </div>
      <Handle type="source" position={Position.Right} id="right"
        style={{ opacity: 0, width: 1, height: 1 }} />
    </>
  );
}

const nodeTypes = { sessionNode: SessionNodeComponent };

// ── Tree layout ───────────────────────────────────────────────────────────

function buildGraph(
  sessions: SessionInfo[],
  activeSessions: Set<string>,
  highlightId: string | null
): { nodes: Node[], edges: Edge[] } {
  if (!sessions.length) return { nodes: [], edges: [] };

  // Index
  const byId = new Map(sessions.map(s => [s.sessionId, s]));
  const childrenOf = new Map<string, SessionInfo[]>();
  const roots: SessionInfo[] = [];

  for (const s of sessions) {
    const validParent = s.parentSessionId && byId.has(s.parentSessionId);
    if (validParent) {
      if (!childrenOf.has(s.parentSessionId!)) childrenOf.set(s.parentSessionId!, []);
      childrenOf.get(s.parentSessionId!)!.push(s);
    } else {
      roots.push(s);
    }
  }

  // Sort roots: most recent first
  roots.sort((a, b) => b.lastUpdated - a.lastUpdated);
  // Sort children: oldest first (chronological within a tree)
  for (const [, children] of childrenOf) {
    children.sort((a, b) => a.lastUpdated - b.lastUpdated);
  }

  // Memoised subtree height
  const heightCache = new Map<string, number>();
  function subtreeH(id: string): number {
    if (heightCache.has(id)) return heightCache.get(id)!;
    const children = childrenOf.get(id) || [];
    let h: number;
    if (!children.length) {
      h = NODE_H;
    } else {
      const total = children.reduce(
        (sum, c) => sum + subtreeH(c.sessionId) + V_GAP, -V_GAP
      );
      h = Math.max(total, NODE_H);
    }
    heightCache.set(id, h);
    return h;
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function place(s: SessionInfo, x: number, topY: number, parentId?: string) {
    const h  = subtreeH(s.sessionId);
    const ny = topY + (h - NODE_H) / 2;

    nodes.push({
      id:       s.sessionId,
      type:     "sessionNode",
      position: { x, y: ny },
      data: {
        ...s,
        isHighlighted: s.sessionId === highlightId,
        accentColor:   agentColor(s.source),
        isLive:        activeSessions.has(s.sessionId),
      } as SessionNodeData,
      style: { width: NODE_W, height: NODE_H },
    });

    if (parentId) {
      edges.push({
        id:     `${parentId}→${s.sessionId}`,
        source: parentId,
        target: s.sessionId,
        sourceHandle: "right",
        targetHandle: "left",
        type:   "smoothstep",
        style:  { stroke: "#252530", strokeWidth: 1.5 },
      });
    }

    const children = childrenOf.get(s.sessionId) || [];
    let cy = topY;
    for (const child of children) {
      place(child, x + NODE_W + H_GAP, cy, s.sessionId);
      cy += subtreeH(child.sessionId) + V_GAP;
    }
  }

  let y = 0;
  for (const root of roots) {
    place(root, 0, y);
    y += subtreeH(root.sessionId) + TREE_GAP;
  }

  return { nodes, edges };
}

// ── Inner flow (needs ReactFlowProvider context) ───────────────────────────

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
  const prevHighlightRef = useRef<string | null>(null);

  const { nodes, edges } = useMemo(
    () => buildGraph(sessions, activeSessions, currentSessionId),
    [sessions, activeSessions, currentSessionId]
  );

  // Auto-pan to active node when it changes
  useEffect(() => {
    if (!currentSessionId || currentSessionId === prevHighlightRef.current) return;
    prevHighlightRef.current = currentSessionId;
    // Small delay so the node is rendered first
    const t = setTimeout(() => {
      const node = getNode(currentSessionId);
      if (node) {
        setCenter(
          node.position.x + NODE_W / 2,
          node.position.y + NODE_H / 2,
          { zoom: 1.4, duration: 350 }
        );
      }
    }, 80);
    return () => clearTimeout(t);
  }, [currentSessionId, getNode, setCenter]);

  // Expose fitView for reset button
  useEffect(() => {
    if (onResetView) onResetView(() => fitView({ duration: 400, padding: 0.1 }));
  }, [fitView, onResetView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNavigateSession(node.id);
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
      minZoom={0.05}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      zoomOnScroll
      className="session-graph-flow"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#1a1a24"
      />
    </ReactFlow>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

interface SessionTreeProps {
  // kept for API compat
  messages: NormalizedMessage[];
  sessionId: string;
  sessionLabel: string;
  highlightSessionId?: string;
  // real props
  allSessions: SessionInfo[];
  activeSessions?: Set<string>;
  onScrollToMessage: (idx: number) => void;
  onNavigateSession: (keyOrId: string) => void;
  onClose: () => void;
}

// ── Outer component ───────────────────────────────────────────────────────

export default function SessionTree({
  allSessions,
  activeSessions,
  highlightSessionId,
  onNavigateSession,
  onClose,
}: SessionTreeProps) {
  const resetViewRef = useRef<(() => void) | null>(null);
  const activeSet = useMemo(
    () => activeSessions || new Set<string>(),
    [activeSessions]
  );

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation Map</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="tree-panel-close"
            onClick={() => resetViewRef.current?.()}
            title="Fit all"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 1012 0A6 6 0 002 8z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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

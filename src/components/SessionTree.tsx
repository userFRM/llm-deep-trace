"use client";

import React, { useMemo, useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SessionInfo } from "@/lib/types";

// ── Types ──

interface SessionNodeData {
  label: string;
  provider: string;
  messageCount: number;
  timestamp: number;
  isCurrent: boolean;
  isSubagent: boolean;
  sessionId: string;
  [key: string]: unknown;
}

type SessionNode = Node<SessionNodeData>;

interface SessionTreeProps {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onClose: () => void;
}

// ── Custom Node ──

function SessionNodeComponent({ data }: NodeProps<SessionNode>) {
  const { label, provider, messageCount, timestamp, isCurrent, isSubagent } =
    data;

  const timeStr = useMemo(() => {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [timestamp]);

  return (
    <>
      <Handle type="target" position={Position.Left} className="tree-handle" />
      <div
        className={`tree-node-card ${isCurrent ? "current" : ""} ${isSubagent ? "subagent" : ""}`}
      >
        <div className="tree-node-top">
          <span className="tree-node-title">{label}</span>
          {provider && <span className="tree-node-badge">{provider}</span>}
        </div>
        <div className="tree-node-bottom">
          <span className="tree-node-msgs">{messageCount} msgs</span>
          <span className="tree-node-time">{timeStr}</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="tree-handle"
      />
    </>
  );
}

const nodeTypes = { sessionNode: SessionNodeComponent };

// ── Tree Layout ──

interface TreeItem {
  session: SessionInfo;
  children: TreeItem[];
}

function buildTree(sessions: SessionInfo[]): TreeItem[] {
  const childMap = new Map<string, SessionInfo[]>();
  const childIds = new Set<string>();

  for (const s of sessions) {
    const isKovaSub = s.key?.startsWith("agent:main:subagent:");
    const parentId = s.parentSessionId || (isKovaSub ? "__main__" : null);
    if (parentId) {
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId)!.push(s);
      childIds.add(s.sessionId);
    }
  }

  // Re-map __main__ children to the actual main session
  const mainSess = sessions.find((s) => s.key === "agent:main:main");
  if (mainSess && childMap.has("__main__")) {
    const existing = childMap.get(mainSess.sessionId) || [];
    childMap.set(mainSess.sessionId, [
      ...existing,
      ...childMap.get("__main__")!,
    ]);
    childMap.delete("__main__");
  }

  function makeItem(s: SessionInfo): TreeItem {
    const children = (childMap.get(s.sessionId) || [])
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
      .map(makeItem);
    return { session: s, children };
  }

  const roots = sessions
    .filter((s) => !childIds.has(s.sessionId))
    .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

  return roots.map(makeItem);
}

function layoutTree(
  tree: TreeItem[],
  currentSessionId: string | null
): { nodes: SessionNode[]; edges: Edge[] } {
  const nodes: SessionNode[] = [];
  const edges: Edge[] = [];
  let yOffset = 0;

  // Find the path from root to current session for highlighting edges
  const activePath = new Set<string>();
  function findPath(items: TreeItem[], target: string): boolean {
    for (const item of items) {
      if (item.session.sessionId === target) {
        activePath.add(item.session.sessionId);
        return true;
      }
      if (findPath(item.children, target)) {
        activePath.add(item.session.sessionId);
        return true;
      }
    }
    return false;
  }
  if (currentSessionId) findPath(tree, currentSessionId);

  function layoutItem(
    item: TreeItem,
    depth: number,
    parentId?: string
  ): { minY: number; maxY: number; centerY: number } {
    const x = depth * 260;
    const nodeId = item.session.sessionId;

    if (item.children.length === 0) {
      const y = yOffset;
      yOffset += 80;

      const truncLabel =
        (item.session.label || item.session.title || item.session.key || item.session.sessionId.slice(0, 14))
          .slice(0, 25);

      nodes.push({
        id: nodeId,
        type: "sessionNode",
        position: { x, y },
        data: {
          label: truncLabel,
          provider: item.session.source || "",
          messageCount: item.session.messageCount || 0,
          timestamp: item.session.lastUpdated || 0,
          isCurrent: nodeId === currentSessionId,
          isSubagent: item.session.isSubagent,
          sessionId: nodeId,
        },
      });

      if (parentId) {
        const isActive = activePath.has(parentId) && activePath.has(nodeId);
        edges.push({
          id: `${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: "default",
          style: {
            stroke: isActive ? "#9B72EF" : "var(--border)",
            strokeWidth: isActive ? 2 : 1,
          },
        });
      }

      return { minY: y, maxY: y, centerY: y };
    }

    // Layout children first
    const childResults = item.children.map((child) =>
      layoutItem(child, depth + 1, nodeId)
    );

    const minY = childResults[0].minY;
    const maxY = childResults[childResults.length - 1].maxY;
    const centerY = (minY + maxY) / 2;

    const truncLabel =
      (item.session.label || item.session.title || item.session.key || item.session.sessionId.slice(0, 14))
        .slice(0, 25);

    nodes.push({
      id: nodeId,
      type: "sessionNode",
      position: { x, y: centerY },
      data: {
        label: truncLabel,
        provider: item.session.source || "",
        messageCount: item.session.messageCount || 0,
        timestamp: item.session.lastUpdated || 0,
        isCurrent: nodeId === currentSessionId,
        isSubagent: item.session.isSubagent,
        sessionId: nodeId,
      },
    });

    if (parentId) {
      const isActive = activePath.has(parentId) && activePath.has(nodeId);
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "default",
        style: {
          stroke: isActive ? "#9B72EF" : "var(--border)",
          strokeWidth: isActive ? 2 : 1,
        },
      });
    }

    return { minY, maxY, centerY };
  }

  for (const root of tree) {
    layoutItem(root, 0);
    yOffset += 20; // gap between root trees
  }

  return { nodes, edges };
}

// ── Inner Flow (needs ReactFlowProvider) ──

function InnerFlow({
  sessions,
  currentSessionId,
  onSelectSession,
}: {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
}) {
  const { fitView } = useReactFlow();
  const [hoveredPath, setHoveredPath] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(sessions), [sessions]);
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutTree(tree, currentSessionId),
    [tree, currentSessionId]
  );

  // Apply hover highlighting
  const styledEdges = useMemo(() => {
    if (hoveredPath.size === 0) return layoutEdges;
    return layoutEdges.map((e) => {
      const bothInPath = hoveredPath.has(e.source) && hoveredPath.has(e.target);
      if (bothInPath) {
        return {
          ...e,
          style: { ...e.style, stroke: "#9B72EF", strokeWidth: 2 },
        };
      }
      return e;
    });
  }, [layoutEdges, hoveredPath]);

  useEffect(() => {
    // fitView after layout changes
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 50);
    return () => clearTimeout(timer);
  }, [layoutNodes, fitView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const sid = (node.data as SessionNodeData).sessionId;
      if (sid) onSelectSession(sid);
    },
    [onSelectSession]
  );

  // Build ancestor path for hover highlighting
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of layoutEdges) {
      map.set(e.target, e.source);
    }
    return map;
  }, [layoutEdges]);

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const path = new Set<string>();
      let current: string | undefined = node.id;
      while (current) {
        path.add(current);
        current = parentMap.get(current);
      }
      setHoveredPath(path);
    },
    [parentMap]
  );

  const onNodeMouseLeave = useCallback(() => {
    setHoveredPath(new Set());
  }, []);

  return (
    <ReactFlow
      nodes={layoutNodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      fitView
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="session-tree-flow"
    >
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as SessionNodeData;
          return d.isCurrent ? "#9B72EF" : "var(--border)";
        }}
        maskColor="rgba(0,0,0,0.15)"
        className="session-tree-minimap"
      />
    </ReactFlow>
  );
}

// ── Main Export ──

export default function SessionTree({
  sessions,
  currentSessionId,
  onSelectSession,
  onClose,
}: SessionTreeProps) {
  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Session Tree</span>
        <button className="tree-panel-close" onClick={onClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="tree-panel-body">
        <ReactFlowProvider>
          <InnerFlow
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

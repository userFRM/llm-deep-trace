"use client";

import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NormalizedMessage, ContentBlock } from "@/lib/types";
import { extractText, cleanPreview } from "@/lib/client-utils";

// ── Types ──

interface TurnInfo {
  turnIndex: number;
  messageIndex: number;
  preview: string;
  subagents: SubagentInfo[];
}

interface SubagentInfo {
  label: string;
  fullLabel: string;
  agentKey: string;
}

interface RootNodeData {
  label: string;
  fullLabel: string;
  [key: string]: unknown;
}

interface TurnNodeData {
  turnIndex: number;
  messageIndex: number;
  preview: string;
  hasSubagents: boolean;
  isSelected?: boolean;
  [key: string]: unknown;
}

interface SubagentNodeData {
  label: string;
  fullLabel: string;
  agentKey: string;
  source?: string;
  accentColor?: string;
  isSelected?: boolean;
  [key: string]: unknown;
}

const agentColors: Record<string, string> = {
  kova:      "#9B72EF",
  claude:    "#9B72EF",
  codex:     "#22C55E",
  kimi:      "#F59E0B",
  gemini:    "#3B82F6",
  opencode:  "#14B8A6",
  aider:     "#EC4899",
  continue:  "#8B5CF6",
  cursor:    "#6366F1",
  copilot:   "#64748B",
  factory:   "#F97316",
};

interface SessionTreeProps {
  messages: NormalizedMessage[];
  sessionId: string;
  sessionLabel: string;
  allSessions: import("@/lib/types").SessionInfo[];
  onScrollToMessage: (messageIndex: number) => void;
  onNavigateSession: (sessionKey: string) => void;
  onClose: () => void;
}

// ── Extract turn structure from messages ──

function buildTurns(messages: NormalizedMessage[]): TurnInfo[] {
  const turns: TurnInfo[] = [];
  let turnIndex = 0;

  // Build a map of toolCallId → result text for extracting agentId from results
  const toolResultMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.message?.role === "toolResult" && msg.message.toolCallId) {
      const text = extractText(msg.message.content);
      toolResultMap.set(msg.message.toolCallId, text);
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.message?.role !== "user") continue;
    if (msg.type === "tool_result" || msg.message.toolCallId) continue;

    turnIndex++;
    const userText = extractText(msg.message.content);
    const preview = cleanPreview(userText).slice(0, 45) || `Turn ${turnIndex}`;

    const subagents: SubagentInfo[] = [];

    // Scan forward for assistant responses until next user turn
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (
        next.message?.role === "user" &&
        !next.message.toolCallId &&
        next.type !== "tool_result"
      )
        break;

      if (
        next.message?.role === "assistant" &&
        Array.isArray(next.message.content)
      ) {
        for (const block of next.message.content as ContentBlock[]) {
          if (
            block.type === "tool_use" &&
            (block.name === "sessions_spawn" ||
              block.name === "Task" ||
              block.name === "task")
          ) {
            const input = block.input || {};
            const desc =
              (input.description as string) ||
              (input.name as string) ||
              (input.prompt as string) ||
              "subagent";
            const fullDesc = desc.trim();
            const label = fullDesc.slice(0, 30);

            // Try to extract agentId from the tool result
            let agentKey = "";
            const resultText = block.id ? toolResultMap.get(block.id) || "" : "";
            // Claude Code results contain "agentId: XXXXX"
            const agentIdMatch = resultText.match(/agentId:\s*([a-zA-Z0-9_-]+)/);
            if (agentIdMatch) {
              agentKey = agentIdMatch[1];
            }
            // For sessions_spawn, try parsing result as JSON
            if (!agentKey && resultText) {
              try {
                const parsed = JSON.parse(resultText);
                agentKey = parsed.childSessionId || parsed.childSessionKey || parsed.agentId || "";
              } catch { /* not JSON */ }
            }
            // Fallback to input fields
            if (!agentKey) {
              agentKey =
                (input.agentId as string) ||
                (input.name as string) ||
                (input.sessionId as string) ||
                block.id ||
                "";
            }
            subagents.push({ label, fullLabel: fullDesc, agentKey });
          }
        }
      }
    }

    turns.push({ turnIndex, messageIndex: i, preview, subagents });
  }

  return turns;
}

// ── Filter turns for display: if >50, show every 5th + turns with subagent spawns ──

function filterTurns(turns: TurnInfo[]): TurnInfo[] {
  if (turns.length <= 50) return turns;
  return turns.filter(
    (t) => t.turnIndex % 5 === 0 || t.subagents.length > 0
  );
}

// ── Custom Nodes ──

function RootNodeComponent({ data }: NodeProps<Node<RootNodeData>>) {
  return (
    <>
      <div className="tree-node-card tree-node-root" title={data.fullLabel || data.label}>
        <div className="tree-node-top">
          <span className="tree-node-title">{data.label}</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="tree-handle"
      />
    </>
  );
}

function TurnNodeComponent({ data }: NodeProps<Node<TurnNodeData>>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="tree-handle" />
      <div
        className={`tree-node-card tree-node-turn${data.isSelected ? " tree-node-selected" : ""}`}
        title={data.preview}
      >
        <div className="tree-node-top">
          <span className="tree-turn-label">Turn {data.turnIndex}</span>
        </div>
        <div className="tree-node-preview">{data.preview}</div>
      </div>
      {data.hasSubagents && (
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="tree-handle"
        />
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="tree-handle"
      />
    </>
  );
}

function SubagentNodeComponent({ data }: NodeProps<Node<SubagentNodeData>>) {
  const accent = data.accentColor || "#9B72EF";
  return (
    <>
      <Handle type="target" position={Position.Left} className="tree-handle" />
      <div
        className={`tree-node-card tree-node-subagent${data.isSelected ? " tree-node-selected" : ""}`}
        title={data.fullLabel || data.label}
        style={{ borderColor: data.isSelected ? accent : `${accent}55` }}
      >
        <div className="tree-node-top">
          <span
            className="tree-node-source-dot"
            style={{ background: accent }}
          />
          <span className="tree-node-title">{data.label}</span>
          {data.source && (
            <span className="tree-node-badge" style={{ color: accent, borderColor: `${accent}44` }}>
              {data.source}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

const nodeTypes = {
  rootNode: RootNodeComponent,
  turnNode: TurnNodeComponent,
  subagentNode: SubagentNodeComponent,
};

// ── Layout ──

function layoutTurns(
  turns: TurnInfo[],
  label: string
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const TURN_X = 0;
  const SUBAGENT_X = 280;
  const ROW_HEIGHT = 100;
  const SUB_ROW_HEIGHT = 56;
  const ROOT_Y = 0;

  // Root session node
  nodes.push({
    id: "root",
    type: "rootNode",
    position: { x: TURN_X, y: ROOT_Y },
    data: { label: label.slice(0, 30), fullLabel: label },
  });

  let y = 70;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const turnId = `turn-${turn.turnIndex}`;

    nodes.push({
      id: turnId,
      type: "turnNode",
      position: { x: TURN_X, y },
      data: {
        turnIndex: turn.turnIndex,
        messageIndex: turn.messageIndex,
        preview: turn.preview,
        hasSubagents: turn.subagents.length > 0,
      },
    });

    // Edge from previous
    const prevId = i === 0 ? "root" : `turn-${turns[i - 1].turnIndex}`;
    edges.push({
      id: `${prevId}->${turnId}`,
      source: prevId,
      target: turnId,
      sourceHandle: prevId === "root" ? undefined : "bottom",
      type: "straight",
      style: { stroke: "var(--border)", strokeWidth: 1 },
    });

    // Subagent branches to the right
    for (let j = 0; j < turn.subagents.length; j++) {
      const sub = turn.subagents[j];
      const subId = `${turnId}-sub-${j}`;
      const subY = y + j * SUB_ROW_HEIGHT;

      nodes.push({
        id: subId,
        type: "subagentNode",
        position: { x: SUBAGENT_X, y: subY },
        data: { label: sub.label, fullLabel: sub.fullLabel || sub.label, agentKey: sub.agentKey },
      });

      edges.push({
        id: `${turnId}->${subId}`,
        source: turnId,
        target: subId,
        sourceHandle: "right",
        type: "straight",
        style: { stroke: "var(--border)", strokeWidth: 1 },
      });
    }

    // Advance Y, accounting for subagent stack height
    const subHeight =
      turn.subagents.length > 1
        ? (turn.subagents.length - 1) * SUB_ROW_HEIGHT
        : 0;
    y += Math.max(ROW_HEIGHT, subHeight + ROW_HEIGHT);
  }

  return { nodes, edges };
}

// ── Inner Flow (needs ReactFlowProvider) ──

function InnerFlow({
  messages,
  sessionId: currentSessionId,
  sessionLabel: label,
  allSessions,
  onScrollToMessage,
  onNavigateSession,
  onResetView,
}: {
  messages: NormalizedMessage[];
  sessionId: string;
  sessionLabel: string;
  allSessions: import("@/lib/types").SessionInfo[];
  onScrollToMessage: (messageIndex: number) => void;
  onNavigateSession: (sessionKey: string) => void;
  onResetView?: (fn: () => void) => void;
}) {
  const { fitView } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Real child sessions from the session index (works for both Task and TaskCreate/Agent Teams)
  const childSessions = useMemo(
    () => allSessions.filter(
      (s) => s.parentSessionId === currentSessionId || s.parentSessionId === currentSessionId
    ),
    [allSessions, currentSessionId]
  );

  // Build turns from messages, then enrich subagent nodes with real session IDs
  const turns = useMemo(() => {
    const raw = filterTurns(buildTurns(messages));

    // For each turn's subagents, try to resolve agentKey → real sessionId
    for (const turn of raw) {
      for (const sub of turn.subagents) {
        if (!sub.agentKey) continue;
        // Try to find a matching child session
        const match = childSessions.find(
          (s) =>
            s.sessionId === sub.agentKey ||
            s.sessionId.includes(sub.agentKey) ||
            ("agent-" + sub.agentKey) === s.sessionId ||
            s.sessionId.endsWith(sub.agentKey)
        );
        if (match) sub.agentKey = match.sessionId;
      }
    }

    // Add any child sessions not already covered by turns (Agent Teams: TaskCreate-based)
    const coveredIds = new Set(raw.flatMap((t) => t.subagents.map((s) => s.agentKey)));
    const uncovered = childSessions.filter((s) => !coveredIds.has(s.sessionId));
    if (uncovered.length > 0 && raw.length > 0) {
      // Attach uncovered children to the last turn as a group
      const lastTurn = raw[raw.length - 1];
      for (const s of uncovered) {
        const fullSub = s.label || s.sessionId;
        lastTurn.subagents.push({
          label: fullSub.slice(0, 30),
          fullLabel: fullSub,
          agentKey: s.sessionId,
        });
      }
    }

    return raw;
  }, [messages, childSessions]);

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => layoutTurns(turns, label),
    [turns, label]
  );

  // Build sessionId → source lookup for agent-type coloring
  const sessionById = useMemo(() => {
    const m = new Map<string, import("@/lib/types").SessionInfo>();
    for (const s of allSessions) m.set(s.sessionId, s);
    return m;
  }, [allSessions]);

  // Enrich nodes with selection state and agent-type colors
  const nodes = useMemo(() => rawNodes.map((node) => {
    if (node.type === "subagentNode") {
      const d = node.data as SubagentNodeData;
      const sess = d.agentKey ? sessionById.get(d.agentKey) : undefined;
      const source = sess?.source || "kova";
      const accentColor = agentColors[source] || "#9B72EF";
      return {
        ...node,
        data: { ...d, source, accentColor, isSelected: node.id === selectedNodeId },
      };
    }
    if (node.type === "turnNode") {
      return {
        ...node,
        data: { ...node.data, isSelected: node.id === selectedNodeId },
      };
    }
    return node;
  }), [rawNodes, selectedNodeId, sessionById]);

  // Add directional arrow markers to edges
  const edges = useMemo(() => rawEdges.map((edge) => ({
    ...edge,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 10,
      height: 10,
      color: "#2a2a38",
    },
    style: { ...edge.style, stroke: "#2a2a38", strokeWidth: 1.5 },
  })), [rawEdges]);

  // Fit once on mount only — never re-fit while user is browsing
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current || nodes.length === 0) return;
    hasFitted.current = true;
    const timer = setTimeout(() => {
      // More padding for small graphs (few turns), less for large ones — prevents over-zooming
      const padding = nodes.length <= 4 ? 0.35 : nodes.length <= 10 ? 0.2 : 0.12;
      fitView({ padding, minZoom: 0.15, maxZoom: 0.75, duration: 300 });
    }, 80);
    return () => clearTimeout(timer);
  }, [nodes.length > 0, fitView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose reset-view callback to parent
  useEffect(() => {
    if (onResetView) {
      onResetView(() => {
        fitView({ padding: 0.12, duration: 300 });
      });
    }
  }, [fitView, onResetView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
      if (node.type === "turnNode") {
        const d = node.data as TurnNodeData;
        onScrollToMessage(d.messageIndex);
      } else if (node.type === "subagentNode") {
        const d = node.data as SubagentNodeData;
        if (d.agentKey) onNavigateSession(d.agentKey);
      }
    },
    [onScrollToMessage, onNavigateSession]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="session-tree-flow"
    />
  );
}

// ── Main Export ──

export default function SessionTree({
  messages,
  sessionId,
  sessionLabel: label,
  allSessions,
  onScrollToMessage,
  onNavigateSession,
  onClose,
}: SessionTreeProps) {
  const resetViewRef = useRef<(() => void) | null>(null);

  const handleResetView = useCallback((fn: () => void) => {
    resetViewRef.current = fn;
  }, []);

  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation Map</span>
        <div className="tree-panel-actions">
          <button
            className="tree-panel-reset"
            onClick={() => resetViewRef.current?.()}
            title="Reset view"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8a6 6 0 0110.47-4M14 8a6 6 0 01-10.47 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M12 1v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
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
      </div>
      <div className="tree-panel-body">
        <ReactFlowProvider key={sessionId}>
          <InnerFlow
            messages={messages}
            sessionId={sessionId}
            sessionLabel={label}
            allSessions={allSessions}
            onScrollToMessage={onScrollToMessage}
            onNavigateSession={onNavigateSession}
            onResetView={handleResetView}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

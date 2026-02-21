"use client";

import React, { useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Handle,
  Position,
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
  agentKey: string;
}

interface RootNodeData {
  label: string;
  [key: string]: unknown;
}

interface TurnNodeData {
  turnIndex: number;
  messageIndex: number;
  preview: string;
  hasSubagents: boolean;
  [key: string]: unknown;
}

interface SubagentNodeData {
  label: string;
  agentKey: string;
  [key: string]: unknown;
}

interface SessionTreeProps {
  messages: NormalizedMessage[];
  sessionId: string;
  sessionLabel: string;
  onScrollToMessage: (messageIndex: number) => void;
  onNavigateSession: (sessionKey: string) => void;
  onClose: () => void;
}

// ── Extract turn structure from messages ──

function buildTurns(messages: NormalizedMessage[]): TurnInfo[] {
  const turns: TurnInfo[] = [];
  let turnIndex = 0;

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
            const label = desc.slice(0, 30);
            const agentKey =
              (input.agentId as string) ||
              (input.name as string) ||
              (input.sessionId as string) ||
              block.id ||
              "";
            subagents.push({ label, agentKey });
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
      <div className="tree-node-card tree-node-root">
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
      <div className="tree-node-card tree-node-turn">
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
  return (
    <>
      <Handle type="target" position={Position.Left} className="tree-handle" />
      <div className="tree-node-card tree-node-subagent">
        <div className="tree-node-top">
          <span className="tree-node-title">{data.label}</span>
          <span className="tree-node-badge">subagent</span>
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
    data: { label },
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
        data: { label: sub.label, agentKey: sub.agentKey },
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
  sessionLabel: label,
  onScrollToMessage,
  onNavigateSession,
}: {
  messages: NormalizedMessage[];
  sessionLabel: string;
  onScrollToMessage: (messageIndex: number) => void;
  onNavigateSession: (sessionKey: string) => void;
}) {
  const { fitView } = useReactFlow();

  const turns = useMemo(() => filterTurns(buildTurns(messages)), [messages]);
  const { nodes, edges } = useMemo(
    () => layoutTurns(turns, label),
    [turns, label]
  );

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 50);
    return () => clearTimeout(timer);
  }, [nodes, fitView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
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
      fitView
      minZoom={0.3}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="session-tree-flow"
    />
  );
}

// ── Main Export ──

export default function SessionTree({
  messages,
  sessionLabel: label,
  onScrollToMessage,
  onNavigateSession,
  onClose,
}: SessionTreeProps) {
  return (
    <div className="tree-panel">
      <div className="tree-panel-header">
        <span className="tree-panel-title">Conversation Map</span>
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
            messages={messages}
            sessionLabel={label}
            onScrollToMessage={onScrollToMessage}
            onNavigateSession={onNavigateSession}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

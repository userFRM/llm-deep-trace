export interface SessionInfo {
  sessionId: string;
  key: string;
  label?: string;
  lastUpdated: number;
  channel: string;
  chatType: string;
  messageCount: number;
  preview: string;
  isActive: boolean;
  isDeleted: boolean;
  isSubagent: boolean;
  parentSessionId?: string;
  compactionCount: number;
  source?: string;
  model?: string;
  cwd?: string;
}

export interface NormalizedMessage {
  type: string;
  timestamp?: string;
  message?: {
    role: string;
    content: ContentBlock[] | string;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
  };
  // For special event types
  summary?: string;
  modelId?: string;
  provider?: string;
  thinkingLevel?: string;
  customType?: string;
  data?: Record<string, unknown>;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  tool_use_id?: string;
  content?: ContentBlock[] | string;
  is_error?: boolean;
}

export interface RawEntry {
  type: string;
  timestamp?: string;
  message?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  summary?: string;
  modelId?: string;
  provider?: string;
  thinkingLevel?: string;
  customType?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

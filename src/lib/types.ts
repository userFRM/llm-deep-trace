export interface SessionInfo {
  sessionId: string;
  key: string;
  label?: string;
  title?: string;
  lastUpdated: number;
  channel: string;
  chatType: string;
  messageCount: number;
  preview: string;
  isActive: boolean;
  isDeleted: boolean;
  isSubagent: boolean;
  parentSessionId?: string;
  hasSubagents?: boolean;
  compactionCount: number;
  source?: string;
  model?: string;
  cwd?: string;
  filePath?: string;
  // Agent team metadata (Claude Code agent teams)
  teamName?: string;
  isSidechain?: boolean;
}

export interface BlockColors {
  exec: string;
  file: string;
  web: string;
  browser: string;
  msg: string;
  agent: string;
  thinking: string;
  "user-msg": string;
  "asst-text": string;
}

export interface AppSettings {
  showTimestamps: boolean;
  autoExpandToolCalls: boolean;
  compactSidebar: boolean;
  skipPreamble: boolean;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const DEFAULT_BLOCK_COLORS: BlockColors = {
  exec: "#22C55E",
  file: "#3B82F6",
  web: "#8B5CF6",
  browser: "#06B6D4",
  msg: "#F59E0B",
  agent: "#9B72EF",
  thinking: "#71717A",
  "user-msg": "#9B72EF",
  "asst-text": "#E8E8F0",
};

export const DEFAULT_SETTINGS: AppSettings = {
  showTimestamps: true,
  autoExpandToolCalls: false,
  compactSidebar: false,
  skipPreamble: false,
};

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
  // Agent team metadata
  teamName?: string;
  isSidechain?: boolean;
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

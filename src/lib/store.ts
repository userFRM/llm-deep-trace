"use client";

import { create } from "zustand";
import { SessionInfo, RawEntry, NormalizedMessage, BlockColors, AppSettings, DEFAULT_BLOCK_COLORS, DEFAULT_SETTINGS } from "./types";
import { normalizeEntries } from "./normalizers";

export type BlockCategory = "thinking" | "exec" | "file" | "web" | "browser" | "msg" | "agent";

export type BlockExpansion = Record<BlockCategory, boolean>;

interface AppState {
  sessions: SessionInfo[];
  filteredSessions: SessionInfo[];
  currentSessionId: string | null;
  currentMessages: NormalizedMessage[];
  rawEntries: RawEntry[];
  loading: boolean;
  sseConnected: boolean;
  searchQuery: string;
  sourceFilters: Record<string, boolean>;
  expandedGroups: Set<string>;
  allThinkingExpanded: boolean;
  blockExpansion: BlockExpansion;
  treePanelOpen: boolean;
  treePanelManualClose: boolean;
  theme: string;
  sidebarWidth: number;
  treePanelWidth: number;
  settingsOpen: boolean;
  blockColors: BlockColors;
  settings: AppSettings;
  scrollTargetIndex: number | null;
  archivedSessionIds: Set<string>;
  sidebarTab: "browse" | "archived" | "analytics";
  activeSessions: Set<string>;

  setSessions: (sessions: SessionInfo[]) => void;
  setCurrentSession: (id: string | null) => void;
  setMessages: (entries: RawEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setSseConnected: (connected: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSourceFilter: (source: string) => void;
  toggleGroupExpanded: (sessionId: string) => void;
  expandAllGroups: () => void;
  collapseAllGroups: () => void;
  toggleAllThinking: () => void;
  toggleBlockExpansion: (category: BlockCategory) => void;
  setTreePanelOpen: (open: boolean) => void;
  setTreePanelManualClose: (val: boolean) => void;
  setTheme: (theme: string) => void;
  setSidebarWidth: (w: number) => void;
  setTreePanelWidth: (w: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setBlockColor: (key: keyof BlockColors, color: string) => void;
  resetBlockColor: (key: keyof BlockColors) => void;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setScrollTargetIndex: (idx: number | null) => void;
  archiveSession: (sessionId: string) => void;
  unarchiveSession: (sessionId: string) => void;
  setSidebarTab: (tab: "browse" | "archived" | "analytics") => void;
  setActiveSessions: (ids: Set<string>) => void;
  initFromLocalStorage: () => void;
  applyFilter: () => void;
}

function loadExpandedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem("llm-deep-trace-expanded");
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveExpandedGroups(groups: Set<string>) {
  try {
    localStorage.setItem("llm-deep-trace-expanded", JSON.stringify([...groups]));
  } catch { /* ignore */ }
}

function loadBlockColors(): BlockColors {
  try {
    const raw = localStorage.getItem("llm-deep-trace-block-colors");
    if (raw) return { ...DEFAULT_BLOCK_COLORS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_BLOCK_COLORS };
}

function saveBlockColors(colors: BlockColors) {
  try {
    localStorage.setItem("llm-deep-trace-block-colors", JSON.stringify(colors));
  } catch { /* ignore */ }
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("llm-deep-trace-settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem("llm-deep-trace-settings", JSON.stringify(settings));
  } catch { /* ignore */ }
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem("llm-deep-trace-sidebar-w");
    if (raw) {
      const w = parseInt(raw, 10);
      if (w >= 200 && w <= 480) return w;
    }
  } catch { /* ignore */ }
  return 280;
}

function loadTreePanelWidth(): number {
  try {
    const raw = localStorage.getItem("llm-deep-trace-tree-w");
    if (raw) {
      const w = parseInt(raw, 10);
      if (w >= 240 && w <= 600) return w;
    }
  } catch { /* ignore */ }
  return 380;
}

function loadArchivedIds(): Set<string> {
  try {
    const raw = localStorage.getItem("llm-deep-trace-archived");
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveArchivedIds(ids: Set<string>) {
  try {
    localStorage.setItem("llm-deep-trace-archived", JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function buildGroupedSessions(list: SessionInfo[]): SessionInfo[] {
  const childrenOf = new Map<string, SessionInfo[]>();
  const childIds = new Set<string>();

  for (const s of list) {
    const isKovaSubagent = s.key?.startsWith("agent:main:subagent:");
    const parentId = s.parentSessionId || (isKovaSubagent ? "__main__" : null);
    if (parentId) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(s);
      childIds.add(s.sessionId);
    }
  }

  const mainSess = list.find((s) => s.key === "agent:main:main");
  if (mainSess && childrenOf.has("__main__")) {
    childrenOf.set(mainSess.sessionId, [
      ...(childrenOf.get(mainSess.sessionId) || []),
      ...childrenOf.get("__main__")!,
    ]);
    childrenOf.delete("__main__");
  }

  const result: SessionInfo[] = [];
  const added = new Set<string>();

  for (const s of list) {
    if (added.has(s.sessionId) || childIds.has(s.sessionId)) continue;
    result.push(s);
    added.add(s.sessionId);
    const children = childrenOf.get(s.sessionId) || [];
    children.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
    for (const c of children) {
      if (!added.has(c.sessionId)) {
        result.push(c);
        added.add(c.sessionId);
      }
    }
  }

  for (const s of list) {
    if (!added.has(s.sessionId)) {
      result.push(s);
      added.add(s.sessionId);
    }
  }
  return result;
}

const DEFAULT_SOURCE_FILTERS: Record<string, boolean> = {
  kova: true,
  claude: true,
  codex: true,
  kimi: true,
  gemini: true,
  copilot: true,
  factory: true,
  opencode: true,
  aider: true,
  continue: true,
  cursor: true,
};

export const useStore = create<AppState>((set, get) => ({
  sessions: [],
  filteredSessions: [],
  currentSessionId: null,
  currentMessages: [],
  rawEntries: [],
  loading: false,
  sseConnected: false,
  searchQuery: "",
  sourceFilters: { ...DEFAULT_SOURCE_FILTERS },
  expandedGroups: new Set<string>(),
  allThinkingExpanded: false,
  blockExpansion: { thinking: false, exec: false, file: false, web: false, browser: false, msg: false, agent: false },
  treePanelOpen: false,
  treePanelManualClose: false,
  theme: "system",
  sidebarWidth: 280,
  treePanelWidth: 380,
  settingsOpen: false,
  blockColors: { ...DEFAULT_BLOCK_COLORS },
  settings: { ...DEFAULT_SETTINGS },
  scrollTargetIndex: null,
  archivedSessionIds: new Set<string>(),
  sidebarTab: "browse",
  activeSessions: new Set<string>(),

  setSessions: (sessions) => {
    sessions.sort((a, b) => {
      if (a.isActive && !a.isDeleted && !(b.isActive && !b.isDeleted)) return -1;
      if (b.isActive && !b.isDeleted && !(a.isActive && !a.isDeleted)) return 1;
      return (b.lastUpdated || 0) - (a.lastUpdated || 0);
    });

    // Detect active sessions (modified in last 60s)
    const now = Date.now();
    const active = new Set<string>();
    for (const s of sessions) {
      if (s.lastUpdated && now - s.lastUpdated < 60000) {
        active.add(s.sessionId);
      }
    }

    set({ sessions, activeSessions: active });
    get().applyFilter();
  },

  setCurrentSession: (id) => set({ currentSessionId: id }),

  setMessages: (entries) => {
    entries.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
    const normalized = normalizeEntries(entries);
    set({ rawEntries: entries, currentMessages: normalized });
  },

  setLoading: (loading) => set({ loading }),
  setSseConnected: (connected) => set({ sseConnected: connected }),

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().applyFilter();
  },

  toggleSourceFilter: (source) => {
    const filters = { ...get().sourceFilters };
    filters[source] = !filters[source];
    set({ sourceFilters: filters });
    get().applyFilter();
  },

  toggleGroupExpanded: (sessionId) => {
    const expanded = new Set(get().expandedGroups);
    if (expanded.has(sessionId)) expanded.delete(sessionId);
    else expanded.add(sessionId);
    set({ expandedGroups: expanded });
    // Not persisted — groups always start collapsed on load
  },

  expandAllGroups: () => {
    const parentIds = new Set<string>();
    for (const s of get().sessions) {
      if (s.parentSessionId) parentIds.add(s.parentSessionId);
      if (s.hasSubagents) parentIds.add(s.sessionId);
      if (s.key?.startsWith("agent:main:subagent:")) {
        const main = get().sessions.find((p) => p.key === "agent:main:main");
        if (main) parentIds.add(main.sessionId);
      }
    }
    set({ expandedGroups: parentIds });
  },

  collapseAllGroups: () => {
    set({ expandedGroups: new Set() });
  },

  toggleAllThinking: () => {
    const newVal = !get().allThinkingExpanded;
    const expansion = { ...get().blockExpansion, thinking: newVal };
    set({ allThinkingExpanded: newVal, blockExpansion: expansion });
  },

  toggleBlockExpansion: (category) => {
    const expansion = { ...get().blockExpansion };
    expansion[category] = !expansion[category];
    if (category === "thinking") {
      set({ blockExpansion: expansion, allThinkingExpanded: expansion.thinking });
    } else {
      set({ blockExpansion: expansion });
    }
  },

  setTreePanelOpen: (open) => set({ treePanelOpen: open }),
  setTreePanelManualClose: (val) => set({ treePanelManualClose: val }),

  setTheme: (theme) => {
    set({ theme });
    const root = document.documentElement;
    root.classList.remove("theme-dim", "theme-light");
    let effective = theme;
    if (theme === "system") {
      effective = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    if (effective === "light") root.classList.add("theme-light");
    try {
      localStorage.setItem("kova-theme", theme);
    } catch {
      // ignore
    }
  },

  setSidebarWidth: (w) => {
    const clamped = Math.max(200, Math.min(480, w));
    set({ sidebarWidth: clamped });
    try {
      localStorage.setItem("llm-deep-trace-sidebar-w", String(clamped));
    } catch { /* ignore */ }
  },

  setTreePanelWidth: (w) => {
    const clamped = Math.max(240, Math.min(600, w));
    set({ treePanelWidth: clamped });
    try {
      localStorage.setItem("llm-deep-trace-tree-w", String(clamped));
    } catch { /* ignore */ }
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setScrollTargetIndex: (idx) => set({ scrollTargetIndex: idx }),

  setBlockColor: (key, color) => {
    const colors = { ...get().blockColors, [key]: color };
    set({ blockColors: colors });
    saveBlockColors(colors);
  },

  resetBlockColor: (key) => {
    const colors = { ...get().blockColors, [key]: DEFAULT_BLOCK_COLORS[key] };
    set({ blockColors: colors });
    saveBlockColors(colors);
  },

  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    saveSettings(settings);
  },

  archiveSession: (sessionId) => {
    const ids = new Set(get().archivedSessionIds);
    ids.add(sessionId);
    set({ archivedSessionIds: ids });
    saveArchivedIds(ids);
    get().applyFilter();
  },

  unarchiveSession: (sessionId) => {
    const ids = new Set(get().archivedSessionIds);
    ids.delete(sessionId);
    set({ archivedSessionIds: ids });
    saveArchivedIds(ids);
    get().applyFilter();
  },

  setSidebarTab: (tab) => {
    set({ sidebarTab: tab });
    get().applyFilter();
  },

  setActiveSessions: (ids) => set({ activeSessions: ids }),

  initFromLocalStorage: () => {
    set({
      expandedGroups: new Set(), // always start collapsed
      blockColors: loadBlockColors(),
      settings: loadSettings(),
      sidebarWidth: loadSidebarWidth(),
      treePanelWidth: loadTreePanelWidth(),
      archivedSessionIds: loadArchivedIds(),
    });
  },

  applyFilter: () => {
    const { sessions, searchQuery, sourceFilters, archivedSessionIds, sidebarTab } = get();
    const q = searchQuery.toLowerCase().trim();
    const isArchiveTab = sidebarTab === "archived";
    const filtered = sessions.filter((s) => {
      const src = s.source || "kova";
      if (sourceFilters[src] === false) return false;
      // Archive filtering
      const isArchived = archivedSessionIds.has(s.sessionId);
      if (isArchiveTab && !isArchived) return false;
      if (!isArchiveTab && isArchived) return false;
      if (!q) return true;
      const label = (s.label || s.title || s.key || "").toLowerCase();
      const preview = (s.preview || "").toLowerCase();
      const key = (s.key || "").toLowerCase();
      const id = (s.sessionId || "").toLowerCase();
      return (
        label.includes(q) ||
        preview.includes(q) ||
        key.includes(q) ||
        id.includes(q)
      );
    });
    const grouped = q ? filtered : buildGroupedSessions(filtered);
    set({ filteredSessions: grouped });
  },
}));

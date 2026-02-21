"use client";

import { create } from "zustand";
import { SessionInfo, RawEntry, NormalizedMessage, BlockColors, AppSettings, DEFAULT_BLOCK_COLORS, DEFAULT_SETTINGS } from "./types";
import { normalizeEntries } from "./normalizers";

interface AppState {
  sessions: SessionInfo[];
  filteredSessions: SessionInfo[];
  currentSessionId: string | null;
  currentMessages: NormalizedMessage[];
  rawEntries: RawEntry[];
  loading: boolean;
  sseConnected: boolean;
  searchQuery: string;
  sourceFilters: { kova: boolean; claude: boolean; codex: boolean };
  expandedGroups: Set<string>;
  allThinkingExpanded: boolean;
  theme: string;
  sidebarWidth: number;
  settingsOpen: boolean;
  blockColors: BlockColors;
  settings: AppSettings;

  setSessions: (sessions: SessionInfo[]) => void;
  setCurrentSession: (id: string | null) => void;
  setMessages: (entries: RawEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setSseConnected: (connected: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSourceFilter: (source: string) => void;
  toggleGroupExpanded: (sessionId: string) => void;
  toggleAllThinking: () => void;
  setTheme: (theme: string) => void;
  setSidebarWidth: (w: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setBlockColor: (key: keyof BlockColors, color: string) => void;
  resetBlockColor: (key: keyof BlockColors) => void;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
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

export const useStore = create<AppState>((set, get) => ({
  sessions: [],
  filteredSessions: [],
  currentSessionId: null,
  currentMessages: [],
  rawEntries: [],
  loading: false,
  sseConnected: false,
  searchQuery: "",
  sourceFilters: { kova: true, claude: true, codex: true },
  expandedGroups: new Set<string>(),
  allThinkingExpanded: false,
  theme: "system",
  sidebarWidth: 280,
  settingsOpen: false,
  blockColors: { ...DEFAULT_BLOCK_COLORS },
  settings: { ...DEFAULT_SETTINGS },

  setSessions: (sessions) => {
    sessions.sort((a, b) => {
      if (a.isActive && !a.isDeleted && !(b.isActive && !b.isDeleted)) return -1;
      if (b.isActive && !b.isDeleted && !(a.isActive && !a.isDeleted)) return 1;
      return (b.lastUpdated || 0) - (a.lastUpdated || 0);
    });
    set({ sessions });
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
    (filters as Record<string, boolean>)[source] =
      !(filters as Record<string, boolean>)[source];
    set({ sourceFilters: filters });
    get().applyFilter();
  },

  toggleGroupExpanded: (sessionId) => {
    const expanded = new Set(get().expandedGroups);
    if (expanded.has(sessionId)) expanded.delete(sessionId);
    else expanded.add(sessionId);
    set({ expandedGroups: expanded });
    saveExpandedGroups(expanded);
  },

  toggleAllThinking: () =>
    set({ allThinkingExpanded: !get().allThinkingExpanded }),

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

  setSettingsOpen: (open) => set({ settingsOpen: open }),

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

  initFromLocalStorage: () => {
    set({
      expandedGroups: loadExpandedGroups(),
      blockColors: loadBlockColors(),
      settings: loadSettings(),
      sidebarWidth: loadSidebarWidth(),
    });
  },

  applyFilter: () => {
    const { sessions, searchQuery, sourceFilters } = get();
    const q = searchQuery.toLowerCase().trim();
    const filtered = sessions.filter((s) => {
      const src = s.source || "kova";
      if (!(sourceFilters as Record<string, boolean>)[src]) return false;
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

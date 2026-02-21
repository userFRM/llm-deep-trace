"use client";

import { create } from "zustand";
import { SessionInfo, RawEntry, NormalizedMessage } from "./types";
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
  applyFilter: () => void;
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

function getSessionLabel(s: SessionInfo): string {
  if (s.key === "agent:main:main") return "main session";
  if (s.label) return s.label;
  if (s.key) {
    const parts = s.key.split(":");
    if (parts.length > 2) return parts.slice(1).join(":");
    return s.key;
  }
  return s.sessionId.slice(0, 14) + "\u2026";
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

  applyFilter: () => {
    const { sessions, searchQuery, sourceFilters } = get();
    const q = searchQuery.toLowerCase().trim();
    let filtered = sessions.filter((s) => {
      const src = s.source || "kova";
      if (!(sourceFilters as Record<string, boolean>)[src]) return false;
      if (!q) return true;
      const label = getSessionLabel(s).toLowerCase();
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

"use client";

import { useEffect, useCallback, lazy, Suspense } from "react";
import { useStore } from "@/lib/store";
import { useSSE } from "@/lib/useSSE";
import { sessionLabel } from "@/lib/client-utils";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";

const SessionTree = lazy(() => import("./SessionTree"));

export default function App() {
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const currentMessages = useStore((s) => s.currentMessages);
  const treePanelOpen = useStore((s) => s.treePanelOpen);
  const setTreePanelOpen = useStore((s) => s.setTreePanelOpen);
  const setTheme = useStore((s) => s.setTheme);
  const initFromLocalStorage = useStore((s) => s.initFromLocalStorage);
  const setScrollTargetIndex = useStore((s) => s.setScrollTargetIndex);

  useEffect(() => {
    // Initialize all persisted settings from localStorage
    initFromLocalStorage();

    try {
      const saved = localStorage.getItem("kova-theme") || "system";
      setTheme(saved);
    } catch {
      setTheme("system");
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const theme = useStore.getState().theme;
      if (theme === "system") {
        const root = document.documentElement;
        root.classList.remove("theme-dim", "theme-light");
        if (!mq.matches) root.classList.add("theme-light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setTheme, initFromLocalStorage]);

  useEffect(() => {
    fetch("/api/all-sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        if (!currentSessionId && data.length) {
          const main = data.find(
            (s: { key: string }) => s.key === "agent:main:main"
          );
          setCurrentSession(main ? main.sessionId : data[0].sessionId);
        }
      })
      .catch(() => {});
  }, [setSessions, setCurrentSession, currentSessionId]);

  useSSE();

  // Scroll-to-message handler for the tree panel
  const handleScrollToMessage = useCallback(
    (messageIndex: number) => {
      setScrollTargetIndex(messageIndex);
    },
    [setScrollTargetIndex]
  );

  // Navigate to a child/subagent session by key or ID (supports partial ID matching)
  const handleNavigateSession = useCallback(
    (keyOrId: string) => {
      if (!keyOrId) return;
      const target = sessions.find(
        (s) =>
          s.sessionId === keyOrId ||
          s.key === keyOrId ||
          s.sessionId.startsWith(keyOrId) ||
          s.key.endsWith("/" + keyOrId.slice(0, 8))
      );
      if (target) {
        setCurrentSession(target.sessionId);
      }
    },
    [sessions, setCurrentSession]
  );

  // Session label for tree panel root node
  const sess = sessions.find((s) => s.sessionId === currentSessionId);
  const sessLabel = sess
    ? sessionLabel(sess)
    : currentSessionId
      ? currentSessionId.slice(0, 14) + "\u2026"
      : "Session";

  return (
    <div className="app-shell">
      <Sidebar />
      <MainPanel />
      {treePanelOpen && currentSessionId && (
        <Suspense fallback={<div className="tree-panel"><div className="loading-state"><div className="spinner" />Loading&hellip;</div></div>}>
          <SessionTree
            messages={currentMessages}
            sessionId={currentSessionId}
            sessionLabel={sessLabel}
            onScrollToMessage={handleScrollToMessage}
            onNavigateSession={handleNavigateSession}
            onClose={() => setTreePanelOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

"use client";

import { useEffect, useCallback, useRef, lazy, Suspense, useState } from "react";
import { useStore } from "@/lib/store";
import { useSSE } from "@/lib/useSSE";
import { sessionLabel } from "@/lib/client-utils";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";
import AnalyticsDashboard from "./AnalyticsDashboard";
import SetupView from "./SetupView";

const SessionTree = lazy(() => import("./SessionTree"));

export default function App() {
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const currentMessages = useStore((s) => s.currentMessages);
  const treePanelOpen = useStore((s) => s.treePanelOpen);
  const setTreePanelOpen = useStore((s) => s.setTreePanelOpen);
  const treePanelManualClose = useStore((s) => s.treePanelManualClose);
  const setTreePanelManualClose = useStore((s) => s.setTreePanelManualClose);
  const treePanelWidth = useStore((s) => s.treePanelWidth);
  const setTreePanelWidth = useStore((s) => s.setTreePanelWidth);
  const setTheme = useStore((s) => s.setTheme);
  const initFromLocalStorage = useStore((s) => s.initFromLocalStorage);
  const setScrollTargetIndex = useStore((s) => s.setScrollTargetIndex);
  const activeSessions = useStore((s) => s.activeSessions);
  const setMessages = useStore((s) => s.setMessages);
  const sidebarTab = useStore((s) => s.sidebarTab);

  const treeDragging = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showSetup, setShowSetup] = useState<boolean | null>(null); // null = not yet checked

  useEffect(() => {
    const forceSetup = new URLSearchParams(window.location.search).get("setup") === "1";
    const done = localStorage.getItem("llm-deep-trace-setup-done");
    // Returning users (pre-date the setup screen) have other keys set — auto-skip
    const isReturningUser = !!localStorage.getItem("llm-deep-trace-settings")
      || !!localStorage.getItem("llm-deep-trace-block-colors");
    if (isReturningUser && !done) {
      localStorage.setItem("llm-deep-trace-setup-done", "1");
    }
    setShowSetup(forceSetup || (!done && !isReturningUser));
  }, []);

  useEffect(() => {
    initFromLocalStorage();
    try {
      const saved = localStorage.getItem("deep-trace-theme") || "system";
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

  // Live tail polling for active sessions
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    if (currentSessionId && activeSessions.has(currentSessionId)) {
      const sess = sessions.find(s => s.sessionId === currentSessionId);
      const source = sess?.source || "kova";

      pollTimerRef.current = setInterval(() => {
        fetch(`/api/sessions/${currentSessionId}/messages?source=${source}`)
          .then((r) => r.json())
          .then((entries) => {
            if (Array.isArray(entries)) setMessages(entries);
          })
          .catch(() => {});
      }, 3000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [currentSessionId, activeSessions, sessions, setMessages]);

  // Auto-show/hide tree panel based on subagents
  useEffect(() => {
    if (!currentSessionId) return;
    const sess = sessions.find((s) => s.sessionId === currentSessionId);
    if (!sess) return;

    if (sess.hasSubagents) {
      if (!treePanelManualClose) {
        setTreePanelOpen(true);
      }
    } else {
      setTreePanelOpen(false);
    }
  }, [currentSessionId, sessions, treePanelManualClose, setTreePanelOpen]);

  // Reset manual close when switching sessions
  useEffect(() => {
    setTreePanelManualClose(false);
  }, [currentSessionId, setTreePanelManualClose]);

  const handleScrollToMessage = useCallback(
    (messageIndex: number) => {
      setScrollTargetIndex(messageIndex);
    },
    [setScrollTargetIndex]
  );

  const handleNavigateSession = useCallback(
    (keyOrId: string) => {
      if (!keyOrId) return;
      const target = sessions.find(
        (s) =>
          s.sessionId === keyOrId ||
          s.key === keyOrId ||
          s.sessionId.startsWith(keyOrId) ||
          s.sessionId.includes(keyOrId) ||
          s.key.endsWith("/" + keyOrId.slice(0, 8)) ||
          ("agent-" + keyOrId) === s.sessionId
      );
      if (target) {
        setCurrentSession(target.sessionId);
      }
    },
    [sessions, setCurrentSession]
  );

  const handleCloseTree = useCallback(() => {
    setTreePanelOpen(false);
    setTreePanelManualClose(true);
  }, [setTreePanelOpen, setTreePanelManualClose]);

  const handleToggleTree = useCallback(() => {
    if (treePanelOpen) {
      handleCloseTree();
    } else {
      setTreePanelOpen(true);
      setTreePanelManualClose(false);
    }
  }, [treePanelOpen, handleCloseTree, setTreePanelOpen, setTreePanelManualClose]);

  // Tree panel drag-to-resize
  const handleTreeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    treeDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startW = treePanelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!treeDragging.current) return;
      const newW = startW - (ev.clientX - startX);
      setTreePanelWidth(newW);
    };

    const onUp = () => {
      treeDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [treePanelWidth, setTreePanelWidth]);

  const sess = sessions.find((s) => s.sessionId === currentSessionId);
  const sessLabel = sess
    ? sessionLabel(sess)
    : currentSessionId
      ? currentSessionId.slice(0, 14) + "\u2026"
      : "Session";

  // Show setup on first run (null = still checking localStorage, avoid flash)
  if (showSetup === null) return null;
  if (showSetup) return <SetupView onDone={() => setShowSetup(false)} />;

  return (
    <div className="app-shell">
      <Sidebar />
      {sidebarTab === "analytics"
        ? <div className="analytics-dashboard"><AnalyticsDashboard /></div>
        : <MainPanel />}
      {/* Right pane tray handle */}
      <div
        className={`tray-handle ${treePanelOpen ? "open" : ""}`}
        onClick={handleToggleTree}
        title={treePanelOpen ? "Close conversation map" : "Open conversation map"}
      >
        <svg width="6" height="24" viewBox="0 0 6 24" fill="none">
          <rect x="1" y="8" width="1.5" height="8" rx="0.75" fill="currentColor" />
          <rect x="3.5" y="8" width="1.5" height="8" rx="0.75" fill="currentColor" />
        </svg>
      </div>
      {treePanelOpen && currentSessionId && (
        <div className="tree-panel-wrap" style={{ width: treePanelWidth }}>
          <div className="tree-resize-handle" onMouseDown={handleTreeMouseDown} />
          <Suspense fallback={<div className="tree-panel"><div className="loading-state"><div className="spinner" />Loading&hellip;</div></div>}>
            <SessionTree
              messages={currentMessages}
              sessionId={currentSessionId}
              sessionLabel={sessLabel}
              allSessions={sessions}
              onScrollToMessage={handleScrollToMessage}
              onNavigateSession={handleNavigateSession}
              onClose={handleCloseTree}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

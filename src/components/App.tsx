"use client";

import { useEffect, lazy, Suspense } from "react";
import { useStore } from "@/lib/store";
import { useSSE } from "@/lib/useSSE";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";

const SessionTree = lazy(() => import("./SessionTree"));

export default function App() {
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const treePanelOpen = useStore((s) => s.treePanelOpen);
  const setTreePanelOpen = useStore((s) => s.setTreePanelOpen);
  const setTheme = useStore((s) => s.setTheme);
  const initFromLocalStorage = useStore((s) => s.initFromLocalStorage);

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

  return (
    <div className="app-shell">
      <Sidebar />
      <MainPanel />
      {treePanelOpen && (
        <Suspense fallback={<div className="tree-panel"><div className="loading-state"><div className="spinner" />Loading&hellip;</div></div>}>
          <SessionTree
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={setCurrentSession}
            onClose={() => setTreePanelOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

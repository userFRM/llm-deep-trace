"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useSSE } from "@/lib/useSSE";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";

export default function App() {
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
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
  }, [setTheme]);

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
    </div>
  );
}

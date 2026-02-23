"use client";

import { useState, useEffect } from "react";

interface AgentResult {
  id: string;
  name: string;
  color: string;
  binary: { found: boolean; path: string | null; isCustom: boolean };
  sessions: { found: boolean; dir: string; defaultDir: string; count: number; dirExists: boolean; isCustom: boolean };
}

interface AgentOverride {
  binaryPath?: string;
  sessionsDir?: string;
}

interface SetupViewProps {
  onDone: () => void;
}

export default function SetupView({ onDone }: SetupViewProps) {
  const [agents, setAgents] = useState<AgentResult[]>([]);
  const [scanning, setScanning] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const [editingBinary, setEditingBinary] = useState<Record<string, string>>({});
  const [editingSessions, setEditingSessions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/detect-agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents || []);
        // Pre-populate override inputs with current custom values
        const binaryEdits: Record<string, string> = {};
        const sessionsEdits: Record<string, string> = {};
        for (const a of data.agents || []) {
          binaryEdits[a.id] = a.binary.path || "";
          sessionsEdits[a.id] = a.sessions.dir;
        }
        setEditingBinary(binaryEdits);
        setEditingSessions(sessionsEdits);
        setScanning(false);
      })
      .catch(() => setScanning(false));
  }, []);

  const setCustomBinary = (id: string, val: string) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], binaryPath: val || undefined } }));
    setEditingBinary((prev) => ({ ...prev, [id]: val }));
  };

  const setCustomSessions = (id: string, val: string) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], sessionsDir: val || undefined } }));
    setEditingSessions((prev) => ({ ...prev, [id]: val }));
  };

  const clearCustomBinary = (id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id].binaryPath;
      return next;
    });
    const agent = agents.find((a) => a.id === id);
    setEditingBinary((prev) => ({ ...prev, [id]: agent?.binary.path || "" }));
  };

  const clearCustomSessions = (id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id].sessionsDir;
      return next;
    });
    const agent = agents.find((a) => a.id === id);
    setEditingSessions((prev) => ({ ...prev, [id]: agent?.sessions.defaultDir || "" }));
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      if (Object.keys(overrides).length > 0) {
        await fetch("/api/agent-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(overrides),
        });
      }
      localStorage.setItem("llm-deep-trace-setup-done", "1");
      onDone();
    } catch {
      onDone(); // proceed anyway
    }
  };

  const foundCount = agents.filter((a) => a.sessions.count > 0).length;
  const totalSessions = agents.reduce((s, a) => s + a.sessions.count, 0);

  return (
    <div className="setup-view">
      <div className="setup-header">
        {/* Gene-sequence logo inline */}
        <svg width="48" height="48" viewBox="0 0 1024 1024" fill="none" className="setup-logo">
          <path d="M832 384l8 1.6-1.6 8 1.6 3.2-4.8 3.2-44.8 161.6-16-4.8 40-147.2-260.8 144-158.4 284.8-11.2-6.4-6.4 6.4-176-176 11.2-11.2 163.2 163.2 147.2-265.6-294.4-297.6 11.2-11.2v-8h9.6l3.2-3.2 3.2 3.2L664 208l1.6 16-395.2 22.4 278.4 278.4 276.8-153.6 6.4 12.8z" fill="#3D1B8C"/>
          <path d="M896 384c0 35.2-28.8 64-64 64s-64-28.8-64-64 28.8-64 64-64 64 28.8 64 64z m-656-32c-62.4 0-112-49.6-112-112s49.6-112 112-112 112 49.6 112 112-49.6 112-112 112z m304 336c-80 0-144-64-144-144s64-144 144-144 144 64 144 144-64 144-144 144z m-224 144c0-35.2 28.8-64 64-64s64 28.8 64 64-28.8 64-64 64-64-28.8-64-64z m-144-176c0-17.6 14.4-32 32-32s32 14.4 32 32-14.4 32-32 32-32-14.4-32-32z m448-440c0-22.4 17.6-40 40-40s40 17.6 40 40-17.6 40-40 40-40-17.6-40-40zM736 560c0-27.2 20.8-48 48-48s48 20.8 48 48-20.8 48-48 48-48-20.8-48-48z" fill="#9B72EF"/>
        </svg>
        <h1 className="setup-title">llm-deep-trace</h1>
        <p className="setup-subtitle">
          {scanning
            ? "scanning for agent sessions\u2026"
            : foundCount > 0
            ? `found ${totalSessions.toLocaleString()} sessions across ${foundCount} agent${foundCount !== 1 ? "s" : ""}`
            : "no sessions found — configure paths below"}
        </p>
        {scanning && <div className="setup-scan-bar"><div className="setup-scan-fill" /></div>}
      </div>

      {!scanning && (
        <>
          <div className="setup-agent-list">
            {agents.map((agent) => {
              const hasCustomBinary = !!(overrides[agent.id]?.binaryPath);
              const hasCustomSessions = !!(overrides[agent.id]?.sessionsDir);
              const binaryVal = editingBinary[agent.id] ?? "";
              const sessionsVal = editingSessions[agent.id] ?? "";

              return (
                <div key={agent.id} className={`setup-agent-row ${agent.sessions.count > 0 ? "has-sessions" : ""}`}>
                  <div className="setup-agent-dot" style={{ background: agent.color }} />
                  <div className="setup-agent-info">
                    <span className="setup-agent-name">{agent.name}</span>
                    <span className={`setup-agent-count ${agent.sessions.count > 0 ? "found" : "empty"}`}>
                      {agent.sessions.count > 0
                        ? `${agent.sessions.count} session${agent.sessions.count !== 1 ? "s" : ""}`
                        : agent.sessions.dirExists ? "0 sessions" : "directory not found"}
                    </span>
                  </div>

                  <div className="setup-agent-paths">
                    {/* Binary */}
                    <div className="setup-path-row">
                      <span className="setup-path-label">binary</span>
                      {hasCustomBinary ? (
                        <div className="setup-path-input-wrap">
                          <input
                            className="setup-path-input"
                            value={binaryVal}
                            onChange={(e) => setCustomBinary(agent.id, e.target.value)}
                            placeholder="path to binary"
                          />
                          <button className="setup-path-clear" onClick={() => clearCustomBinary(agent.id)} title="Reset to auto">×</button>
                        </div>
                      ) : (
                        <div className="setup-path-auto">
                          {agent.binary.found ? (
                            <span className="setup-path-found" title={agent.binary.path || ""}>{agent.binary.path}</span>
                          ) : (
                            <span className="setup-path-missing">not found</span>
                          )}
                          <button className="setup-path-custom-btn" onClick={() => setCustomBinary(agent.id, binaryVal)}>custom</button>
                        </div>
                      )}
                    </div>

                    {/* Sessions dir */}
                    <div className="setup-path-row">
                      <span className="setup-path-label">sessions</span>
                      {hasCustomSessions ? (
                        <div className="setup-path-input-wrap">
                          <input
                            className="setup-path-input"
                            value={sessionsVal}
                            onChange={(e) => setCustomSessions(agent.id, e.target.value)}
                            placeholder="path to sessions directory"
                          />
                          <button className="setup-path-clear" onClick={() => clearCustomSessions(agent.id)} title="Reset to auto">×</button>
                        </div>
                      ) : (
                        <div className="setup-path-auto">
                          <span className={agent.sessions.dirExists ? "setup-path-found" : "setup-path-missing"}
                            title={sessionsVal}>{sessionsVal}</span>
                          <button className="setup-path-custom-btn" onClick={() => setCustomSessions(agent.id, sessionsVal)}>custom</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="setup-footer">
            <button className="setup-start-btn" onClick={handleStart} disabled={saving}>
              {saving ? "saving\u2026" : "start browsing"}
              {!saving && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 6 }}>
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <button className="setup-skip-btn" onClick={onDone}>skip</button>
          </div>
        </>
      )}
    </div>
  );
}

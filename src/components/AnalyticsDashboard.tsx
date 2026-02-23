"use client";

import { useEffect, useState } from "react";

interface AnalyticsData {
  sessionsPerDay: { date: string; count: number; byProvider: Record<string, number> }[];
  messagesPerDay: { date: string; count: number; byProvider: Record<string, number> }[];
  providerBreakdown: { provider: string; count: number; sessions: number; messages: number; pct: number }[];
  topTools: { name: string; count: number }[];
  tokenTotals: { inputTokens: number; outputTokens: number; avgPerSession: number };
  sessionLengthDist: { bucket: string; count: number }[];
  totalSessions: number;
  totalMessages: number;
  avgSessionMessages: number;
  hourOfDay: number[][];
}

const PROVIDER_COLORS: Record<string, string> = {
  kova: "#9B72EF",
  claude: "#3B82F6",
  codex: "#F59E0B",
  kimi: "#06B6D4",
  gemini: "#22C55E",
  copilot: "#52525B",
  factory: "#F97316",
  opencode: "#14B8A6",
  aider: "#EC4899",
  continue: "#8B5CF6",
  cursor: "#6366F1",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ── Stat card ────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Stacked bar chart (sessions or messages per day) ─────
function StackedBarChart({
  data,
  providers,
  chartH = 140,
}: {
  data: { date: string; count: number; byProvider: Record<string, number> }[];
  providers: string[];
  chartH?: number;
}) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barW = Math.max(4, Math.min(16, Math.floor(560 / data.length) - 2));
  const gap = Math.max(1, Math.floor(barW / 4));
  const totalW = data.length * (barW + gap);

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${chartH}`} preserveAspectRatio="none" style={{ display: "block", height: chartH }}>
      {data.map((day, i) => {
        const x = i * (barW + gap);
        let yOffset = chartH;
        return (
          <g key={day.date}>
            {providers.map((p) => {
              const v = day.byProvider[p] || 0;
              if (v === 0) return null;
              const h = Math.max(1, (v / maxVal) * chartH);
              yOffset -= h;
              return (
                <rect
                  key={p}
                  x={x}
                  y={yOffset}
                  width={barW}
                  height={h}
                  fill={PROVIDER_COLORS[p] || "#555"}
                  opacity={0.85}
                >
                  <title>{day.date} · {p}: {v}</title>
                </rect>
              );
            })}
            {/* unfilled portion */}
            {day.count === 0 && (
              <rect x={x} y={chartH - 2} width={barW} height={2} fill="var(--border)" opacity={0.4} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── By-agent breakdown ───────────────────────────────────
function AgentBreakdown({
  data,
  metric,
}: {
  data: { provider: string; count: number; sessions: number; messages: number; pct: number }[];
  metric: "sessions" | "messages";
}) {
  const maxVal = Math.max(...data.map((d) => (metric === "sessions" ? d.sessions : d.messages)), 1);
  return (
    <div className="agent-breakdown">
      {data.map((row) => {
        const val = metric === "sessions" ? row.sessions : row.messages;
        const pct = Math.round((val / maxVal) * 100);
        const color = PROVIDER_COLORS[row.provider] || "#555";
        return (
          <div key={row.provider} className="agent-breakdown-row">
            <span className="agent-breakdown-name" style={{ color }}>
              {row.provider}
            </span>
            <div className="agent-breakdown-bar-wrap">
              <div
                className="agent-breakdown-bar"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="agent-breakdown-val">{fmtNum(val)}</span>
            <span className="agent-breakdown-pct">{Math.round((val / maxVal) * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Time-of-day heatmap ───────────────────────────────────
function HeatmapGrid({ data }: { data: number[][] }) {
  // data[weekday 0-6][hour 0-23]
  const maxVal = Math.max(...data.flat(), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-hours-row">
        <div className="heatmap-day-label" />
        {hours.map((h) => (
          <div key={h} className="heatmap-hour-label">
            {h % 6 === 0 ? `${h}h` : ""}
          </div>
        ))}
      </div>
      {WEEKDAYS.map((day, wi) => (
        <div key={day} className="heatmap-row">
          <div className="heatmap-day-label">{day}</div>
          {hours.map((h) => {
            const val = data[wi][h] || 0;
            const intensity = val / maxVal;
            return (
              <div
                key={h}
                className="heatmap-cell"
                style={{
                  background: val === 0
                    ? "var(--raised)"
                    : `rgba(155, 114, 239, ${0.12 + intensity * 0.88})`,
                }}
                title={`${day} ${h}:00 — ${val} session${val !== 1 ? "s" : ""}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────
export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [agentFilter, setAgentFilter] = useState("all");
  const [metric, setMetric] = useState<"sessions" | "messages">("sessions");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?period=${period}&agent=${agentFilter}`)
      .then((r) => r.json())
      .then((d: AnalyticsData) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [period, agentFilter]);

  if (loading) return <div className="analytics-loading">Loading analytics…</div>;
  if (error || !data) return <div className="analytics-loading">Failed to load analytics</div>;

  const providers = data.providerBreakdown.map((p) => p.provider);
  const chartData = metric === "sessions" ? data.sessionsPerDay : data.messagesPerDay;

  // X-axis date labels (show every Nth)
  const dateLabels = (() => {
    const n = chartData.length;
    const step = n <= 10 ? 1 : n <= 30 ? 5 : 10;
    return chartData.map((d, i) => (i % step === 0 || i === n - 1 ? d.date.slice(5) : ""));
  })();

  return (
    <div className="analytics-dash">

      {/* Controls */}
      <div className="analytics-controls">
        <div className="analytics-filter-group">
          {(["7d", "30d", "90d", "all"] as const).map((p) => (
            <button
              key={p}
              className={`analytics-pill ${period === p ? "active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "all" ? "All time" : `Last ${p}`}
            </button>
          ))}
        </div>
        <select
          className="analytics-agent-select"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
        >
          <option value="all">All agents</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      <div className="stat-cards-row">
        <StatCard
          label="Sessions"
          value={fmtNum(data.totalSessions)}
          sub={`in ${period === "all" ? "all time" : `last ${period}`}`}
        />
        <StatCard
          label="Messages"
          value={fmtNum(data.totalMessages)}
          sub="total across sessions"
        />
        <StatCard
          label="Avg session"
          value={`${data.avgSessionMessages} msgs`}
          sub="messages per session"
        />
        <StatCard
          label="Tokens used"
          value={fmtTokens(data.tokenTotals.inputTokens + data.tokenTotals.outputTokens)}
          sub={`${fmtTokens(data.tokenTotals.avgPerSession)} avg/session`}
        />
      </div>

      {/* Sessions / messages over time */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <span className="analytics-section-title">Activity over time</span>
          <div className="analytics-filter-group small">
            <button
              className={`analytics-pill ${metric === "sessions" ? "active" : ""}`}
              onClick={() => setMetric("sessions")}
            >sessions</button>
            <button
              className={`analytics-pill ${metric === "messages" ? "active" : ""}`}
              onClick={() => setMetric("messages")}
            >messages</button>
          </div>
        </div>
        {/* Provider color legend */}
        <div className="provider-legend">
          {providers.filter((p) => data.providerBreakdown.find(r => r.provider === p)!.count > 0).map((p) => (
            <span key={p} className="legend-item">
              <span className="legend-dot" style={{ background: PROVIDER_COLORS[p] || "#555" }} />
              {p}
            </span>
          ))}
        </div>
        <div className="chart-area">
          <StackedBarChart data={chartData} providers={providers} />
        </div>
        {/* X-axis labels */}
        <div className="chart-x-labels">
          {dateLabels.map((label, i) => (
            <span key={i} className="chart-x-label">{label}</span>
          ))}
        </div>
      </div>

      {/* By-agent breakdown + time-of-day heatmap side by side */}
      <div className="analytics-two-col">
        <div className="analytics-section">
          <div className="analytics-section-header">
            <span className="analytics-section-title">By agent</span>
          </div>
          <AgentBreakdown data={data.providerBreakdown} metric={metric} />
        </div>

        <div className="analytics-section">
          <div className="analytics-section-header">
            <span className="analytics-section-title">Time of day</span>
            <span className="analytics-section-hint">by session file time</span>
          </div>
          <HeatmapGrid data={data.hourOfDay} />
        </div>
      </div>

      {/* Top tools */}
      {data.topTools.length > 0 && (
        <div className="analytics-section">
          <div className="analytics-section-header">
            <span className="analytics-section-title">Top tools (Claude Code)</span>
          </div>
          <div className="tool-bars">
            {data.topTools.map((t, i) => {
              const max = data.topTools[0].count || 1;
              return (
                <div key={t.name} className="tool-bar-row">
                  <span className="tool-rank">{i + 1}</span>
                  <span className="tool-name">{t.name}</span>
                  <div className="tool-bar-wrap">
                    <div className="tool-bar" style={{ width: `${(t.count / max) * 100}%` }} />
                  </div>
                  <span className="tool-count">{fmtNum(t.count)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Token totals */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <span className="analytics-section-title">Token usage</span>
        </div>
        <div className="token-grid">
          <div className="token-cell">
            <span className="token-label">Input</span>
            <span className="token-value">{fmtTokens(data.tokenTotals.inputTokens)}</span>
          </div>
          <div className="token-cell">
            <span className="token-label">Output</span>
            <span className="token-value">{fmtTokens(data.tokenTotals.outputTokens)}</span>
          </div>
          <div className="token-cell">
            <span className="token-label">Total</span>
            <span className="token-value">{fmtTokens(data.tokenTotals.inputTokens + data.tokenTotals.outputTokens)}</span>
          </div>
          <div className="token-cell">
            <span className="token-label">Avg / session</span>
            <span className="token-value">{fmtTokens(data.tokenTotals.avgPerSession)}</span>
          </div>
        </div>
      </div>

      {/* Session length distribution */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <span className="analytics-section-title">Session length distribution</span>
          <span className="analytics-section-hint">by message count</span>
        </div>
        <div className="dist-bars">
          {data.sessionLengthDist.map((row) => {
            const max = Math.max(...data.sessionLengthDist.map((r) => r.count), 1);
            return (
              <div key={row.bucket} className="dist-row">
                <span className="dist-label">{row.bucket}</span>
                <div className="dist-bar-wrap">
                  <div className="dist-bar" style={{ width: `${(row.count / max) * 100}%` }} />
                </div>
                <span className="dist-count">{row.count}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface AnalyticsData {
  sessionsPerDay: { date: string; count: number }[];
  providerBreakdown: { provider: string; count: number; pct: number }[];
  topTools: { name: string; count: number }[];
  tokenTotals: { inputTokens: number; outputTokens: number; avgPerSession: number };
  sessionLengthDist: { bucket: string; count: number }[];
  totalSessions: number;
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

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ── Sessions per day bar chart ──
function SessionsPerDayChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barW = 16;
  const gap = 4;
  const chartW = data.length * (barW + gap);
  const chartH = 140;
  const padTop = 20;
  const padBot = 30;

  return (
    <div className="analytics-section">
      <h3 className="analytics-section-title">Sessions per day</h3>
      <div className="analytics-chart-wrap">
        <svg
          width={chartW}
          height={chartH + padTop + padBot}
          viewBox={`0 0 ${chartW} ${chartH + padTop + padBot}`}
          className="analytics-svg"
        >
          {data.map((d, i) => {
            const barH = (d.count / maxCount) * chartH;
            const x = i * (barW + gap);
            const y = padTop + (chartH - barH);
            const showLabel = i % 5 === 0 || i === data.length - 1;
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, 1)}
                  rx={2}
                  fill="#9B72EF"
                  opacity={d.count > 0 ? 0.85 : 0.15}
                />
                {d.count > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="analytics-bar-label"
                  >
                    {d.count}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={chartH + padTop + 16}
                    textAnchor="middle"
                    className="analytics-axis-label"
                  >
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Provider breakdown horizontal bars ──
function ProviderBreakdown({ data }: { data: { provider: string; count: number; pct: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="analytics-section">
      <h3 className="analytics-section-title">Provider breakdown</h3>
      <div className="analytics-hbar-list">
        {data.map((d) => {
          const color = PROVIDER_COLORS[d.provider] || "#71717A";
          const width = Math.max((d.count / maxCount) * 100, 2);
          return (
            <div key={d.provider} className="analytics-hbar-row">
              <span className="analytics-hbar-label" style={{ color }}>
                {d.provider}
              </span>
              <div className="analytics-hbar-track">
                <div
                  className="analytics-hbar-fill"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
              <span className="analytics-hbar-value">
                {d.count} ({d.pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Top tools ranked list ──
function TopToolsList({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="analytics-section">
        <h3 className="analytics-section-title">Top tools</h3>
        <div className="analytics-empty">No tool usage data (Claude Code JSONL only)</div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="analytics-section">
      <h3 className="analytics-section-title">Top tools</h3>
      <div className="analytics-tools-list">
        {data.map((d, i) => {
          const width = Math.max((d.count / maxCount) * 100, 2);
          return (
            <div key={d.name} className="analytics-tool-row">
              <span className="analytics-tool-rank">{i + 1}.</span>
              <span className="analytics-tool-name">{d.name}</span>
              <div className="analytics-tool-bar-track">
                <div
                  className="analytics-tool-bar-fill"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="analytics-tool-count">{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Token totals ──
function TokenTotals({ data }: { data: { inputTokens: number; outputTokens: number; avgPerSession: number } }) {
  return (
    <div className="analytics-section">
      <h3 className="analytics-section-title">Token totals</h3>
      <div className="analytics-token-grid">
        <div className="analytics-token-card">
          <div className="analytics-token-value">{fmtNum(data.inputTokens)}</div>
          <div className="analytics-token-label">input tokens</div>
        </div>
        <div className="analytics-token-card">
          <div className="analytics-token-value">{fmtNum(data.outputTokens)}</div>
          <div className="analytics-token-label">output tokens</div>
        </div>
        <div className="analytics-token-card">
          <div className="analytics-token-value">{fmtNum(data.inputTokens + data.outputTokens)}</div>
          <div className="analytics-token-label">total</div>
        </div>
        <div className="analytics-token-card">
          <div className="analytics-token-value">{fmtNum(data.avgPerSession)}</div>
          <div className="analytics-token-label">avg / session</div>
        </div>
      </div>
    </div>
  );
}

// ── Session length distribution ──
function SessionLengthDist({ data }: { data: { bucket: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barW = 60;
  const gap = 12;
  const chartW = data.length * (barW + gap);
  const chartH = 100;
  const padTop = 20;
  const padBot = 30;

  return (
    <div className="analytics-section">
      <h3 className="analytics-section-title">Session length distribution</h3>
      <div className="analytics-chart-wrap">
        <svg
          width={chartW}
          height={chartH + padTop + padBot}
          viewBox={`0 0 ${chartW} ${chartH + padTop + padBot}`}
          className="analytics-svg"
        >
          {data.map((d, i) => {
            const barH = (d.count / maxCount) * chartH;
            const x = i * (barW + gap);
            const y = padTop + (chartH - barH);
            return (
              <g key={d.bucket}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, 1)}
                  rx={3}
                  fill="#9B72EF"
                  opacity={d.count > 0 ? 0.85 : 0.15}
                />
                {d.count > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="analytics-bar-label"
                  >
                    {d.count}
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={chartH + padTop + 16}
                  textAnchor="middle"
                  className="analytics-axis-label"
                >
                  {d.bucket}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch analytics");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <div className="loading-state">
          <div className="spinner" />
          Loading analytics&hellip;
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="analytics-dashboard">
        <div className="analytics-empty">{error || "No data"}</div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard scroller">
      <div className="analytics-header">
        <h2 className="analytics-title">Analytics</h2>
        <span className="analytics-total">{data.totalSessions} sessions total</span>
      </div>
      <div className="analytics-body">
        <SessionsPerDayChart data={data.sessionsPerDay} />
        <ProviderBreakdown data={data.providerBreakdown} />
        <TopToolsList data={data.topTools} />
        <TokenTotals data={data.tokenTotals} />
        <SessionLengthDist data={data.sessionLengthDist} />
      </div>
    </div>
  );
}

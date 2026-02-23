"use client";

import { useStore } from "@/lib/store";
import { BlockColors, DEFAULT_BLOCK_COLORS } from "@/lib/types";

const BLOCK_COLOR_ENTRIES: { key: keyof BlockColors; label: string }[] = [
  { key: "exec", label: "Exec / Bash" },
  { key: "file", label: "File ops" },
  { key: "web", label: "Web search/fetch" },
  { key: "browser", label: "Browser" },
  { key: "msg", label: "Message" },
  { key: "agent", label: "Agent / Task" },
  { key: "thinking", label: "Thinking" },
];

const SystemIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5 14h6M8 12v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const DarkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 10.5A6 6 0 115.5 2.5a5 5 0 008 8z" fill="currentColor" />
  </svg>
);

const LightIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.7 3.7l1.4 1.4M10.9 10.9l1.4 1.4M3.7 12.3l1.4-1.4M10.9 5.1l1.4-1.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function SettingsPanel() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const blockColors = useStore((s) => s.blockColors);
  const setBlockColor = useStore((s) => s.setBlockColor);
  const resetBlockColor = useStore((s) => s.resetBlockColor);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const themeButtons = [
    { key: "system", icon: <SystemIcon />, label: "System" },
    { key: "dark", icon: <DarkIcon />, label: "Dark" },
    { key: "light", icon: <LightIcon />, label: "Light" },
  ];

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="settings-close" onClick={() => setSettingsOpen(false)} title="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="settings-body scroller">
        {/* Theme section */}
        <div className="settings-section">
          <div className="settings-section-title">Theme</div>
          <div className="settings-theme-row">
            {themeButtons.map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`settings-theme-btn ${theme === key ? "active" : ""}`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Block colors section */}
        <div className="settings-section">
          <div className="settings-section-title">Block colors</div>
          <div className="settings-colors-list">
            {BLOCK_COLOR_ENTRIES.map(({ key, label }) => (
              <div key={key} className="settings-color-row">
                <span className="settings-color-label">{label}</span>
                <div
                  className="settings-color-swatch"
                  style={{ background: blockColors[key] }}
                />
                <input
                  type="color"
                  value={blockColors[key]}
                  onChange={(e) => setBlockColor(key, e.target.value)}
                  className="settings-color-input"
                />
                {blockColors[key] !== DEFAULT_BLOCK_COLORS[key] && (
                  <button
                    className="settings-color-reset"
                    onClick={() => resetBlockColor(key)}
                    title="Reset to default"
                  >
                    reset
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Display section */}
        <div className="settings-section">
          <div className="settings-section-title">Display</div>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.showTimestamps}
              onChange={(e) => setSetting("showTimestamps", e.target.checked)}
            />
            <span className="settings-toggle-label">Show timestamps</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.autoExpandToolCalls}
              onChange={(e) => setSetting("autoExpandToolCalls", e.target.checked)}
            />
            <span className="settings-toggle-label">Auto-expand tool calls</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.compactSidebar}
              onChange={(e) => setSetting("compactSidebar", e.target.checked)}
            />
            <span className="settings-toggle-label">Compact sidebar</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.skipPreamble}
              onChange={(e) => setSetting("skipPreamble", e.target.checked)}
            />
            <span className="settings-toggle-label">Skip preamble (hide system messages before first user message)</span>
          </label>
        </div>
      </div>
    </div>
  );
}

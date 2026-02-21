"use client";

import { useStore } from "@/lib/store";

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

export default function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const buttons = [
    { key: "system", icon: <SystemIcon />, title: "System default" },
    { key: "dark", icon: <DarkIcon />, title: "Dark" },
    { key: "light", icon: <LightIcon />, title: "Light" },
  ];

  return (
    <div className="theme-toggle" title="Switch theme">
      {buttons.map(({ key, icon, title }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          title={title}
          className={`theme-btn ${theme === key ? "active" : "inactive"}`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

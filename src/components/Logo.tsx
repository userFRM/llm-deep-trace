"use client";

// dot grid positions: 5×5 grid, viewBox 0 0 28 28
// dots at x/y = 2, 8, 14, 20, 26 (spacing 6)
const GRID_DOTS: [number, number][] = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    GRID_DOTS.push([2 + c * 6, 2 + r * 6]);
  }
}

// highlighted dots form a branching tree (the "trace" motif)
const HIGHLIGHTED = new Set<string>([
  "14,2",   // root top
  "14,8",   // trunk down
  "8,14",   // branch left
  "14,14",  // trunk center
  "20,14",  // branch right
  "8,20",   // subagent left continues
  "20,20",  // subagent right continues
]);

// connected edges between highlighted dots (for the trace lines)
const EDGES: [number, number, number, number][] = [
  [14, 2,  14, 8],   // root → trunk
  [14, 8,  14, 14],  // trunk → center
  [14, 14, 8,  14],  // center → left branch
  [14, 14, 20, 14],  // center → right branch
  [8,  14, 8,  20],  // left branch → subagent
  [20, 14, 20, 20],  // right branch → subagent
];

export function LogoMark({ size = 28 }: { size?: number }) {
  const scale = size / 28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* trace connection lines */}
      {EDGES.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#9B72EF"
          strokeWidth="1.2"
          opacity="0.35"
        />
      ))}

      {/* all dots */}
      {GRID_DOTS.map(([x, y]) => {
        const key = `${x},${y}`;
        const isHl = HIGHLIGHTED.has(key);
        return (
          <circle
            key={key}
            cx={x}
            cy={y}
            r={isHl ? 2.5 : 1.4}
            fill={isHl ? "#9B72EF" : "currentColor"}
            opacity={isHl ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

export default function Logo({ className }: { className?: string }) {
  return (
    <div className={`app-logo ${className || ""}`}>
      <LogoMark size={26} />
      <span className="app-logo-name">deep trace</span>
    </div>
  );
}

"use client";

// Archimedean spiral: r = a + b*θ, center at (16,16) in a 32×32 viewbox
// 9 dots placed at 60° increments (every π/3 radians)
// SVG y-axis: positive = downward, so y = cy + r*sin(θ)
const SPIRAL_DOTS = (() => {
  const a = 2, b = 1.1;
  const cx = 16, cy = 16;
  return Array.from({ length: 9 }, (_, i) => {
    const theta = (i * Math.PI) / 3;
    const r = a + b * theta;
    return {
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      // Highlighted = inner half of the spiral (the "deep" part)
      highlighted: i <= 5,
    };
  });
})();

// SVG polyline path through all dots
const PATH = SPIRAL_DOTS.map((d, i) => `${i === 0 ? "M" : "L"} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(" ");

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* spiral trace line */}
      <path
        d={PATH}
        stroke="#9B72EF"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
        fill="none"
      />

      {/* dim outer dots */}
      {SPIRAL_DOTS.filter((d) => !d.highlighted).map((d, i) => (
        <circle
          key={`dim-${i}`}
          cx={d.x}
          cy={d.y}
          r={1.5}
          fill="currentColor"
          opacity={0.2}
        />
      ))}

      {/* highlighted purple dots — inner spiral (the trace) */}
      {SPIRAL_DOTS.filter((d) => d.highlighted).map((d, i) => (
        <circle
          key={`hl-${i}`}
          cx={d.x}
          cy={d.y}
          r={i === 0 ? 2.8 : 2.2 - i * 0.05}
          fill="#9B72EF"
          opacity={1 - i * 0.1}
        />
      ))}
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

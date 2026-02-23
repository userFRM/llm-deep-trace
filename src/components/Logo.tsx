"use client";

const CIRCLES = "M896 384c0 35.2-28.8 64-64 64s-64-28.8-64-64 28.8-64 64-64 64 28.8 64 64z M240 352c-62.4 0-112-49.6-112-112s49.6-112 112-112 112 49.6 112 112-49.6 112-112 112z M544 688c-80 0-144-64-144-144s64-144 144-144 144 64 144 144-64 144-144 144z M320 832c0-35.2 28.8-64 64-64s64 28.8 64 64-28.8 64-64 64-64-28.8-64-64z M176 656c0-17.6 14.4-32 32-32s32 14.4 32 32-14.4 32-32 32-32-14.4-32-32z M624 216c0-22.4 17.6-40 40-40s40 17.6 40 40-17.6 40-40 40-40-17.6-40-40z M736 560c0-27.2 20.8-48 48-48s48 20.8 48 48-20.8 48-48 48-48-20.8-48-48z";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={CIRCLES} fill="#9B72EF"/>
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

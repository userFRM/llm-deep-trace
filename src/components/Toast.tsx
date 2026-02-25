"use client";
import React, { useEffect, useState } from "react";

export const TOAST_EVENT = "ldt:toast";

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}

interface ToastItem {
  id: number;
  message: string;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let counter = 0;
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message: msg }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2000);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 8l4 4 6-7" stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.message}
        </div>
      ))}
    </div>
  );
}

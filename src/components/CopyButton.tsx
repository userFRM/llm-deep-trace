"use client";

import { useState, useCallback } from "react";
import { copyToClipboard } from "@/lib/client-utils";

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3 11V3h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function CopyButton({
  text,
  label,
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      copyToClipboard(text, label).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    },
    [text, label]
  );

  return (
    <button
      className={`copy-btn ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      title={label || "Copy"}
    >
      <CopyIcon />
    </button>
  );
}

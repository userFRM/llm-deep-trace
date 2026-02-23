import type { Metadata } from "next";
import "highlight.js/styles/base16/onedark.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "deep trace",
  description: "Session browser for AI agent CLIs — Claude Code, Codex, OpenClaw, Kimi and more",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "highlight.js/styles/base16/onedark.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "kova sessions",
  description: "Session browser for kova, claude code, and codex agents",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230D0D0F'/%3E%3Ctext x='16' y='22' font-family='Inter,system-ui,sans-serif' font-size='18' font-weight='500' fill='%23E4E4E7' text-anchor='middle'%3Ek%3C/text%3E%3C/svg%3E",
  },
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

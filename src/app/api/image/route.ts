import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const HOME = os.homedir();

const ALLOWED_PREFIXES = [
  path.join(HOME, ".claude"),
  path.join(HOME, ".openclaw"),
  path.join(HOME, ".codex"),
  path.join(HOME, ".kimi"),
  "/tmp",
];

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest) {
  const encoded = req.nextUrl.searchParams.get("path");
  if (!encoded) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Invalid base64 path" }, { status: 400 });
  }

  const resolved = path.resolve(decoded);

  // Security: only serve from allowed directories
  const allowed = ALLOWED_PREFIXES.some((prefix) => resolved.startsWith(prefix));
  if (!allowed) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  // Prevent path traversal
  if (resolved.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  try {
    const data = fs.readFileSync(resolved);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const filePath = body.filePath as string | undefined;

  if (!filePath) {
    return NextResponse.json({ error: "filePath required" }, { status: 400 });
  }

  if (!filePath.includes(sessionId)) {
    return NextResponse.json({ error: "session/path mismatch" }, { status: 400 });
  }

  // The deleted file is in .trash/ inside the same directory
  const trashPath = path.join(path.dirname(filePath), ".trash", path.basename(filePath));

  try {
    // Check trash first
    await fs.access(trashPath);
    await fs.rename(trashPath, filePath);
    return NextResponse.json({ ok: true, restored: filePath });
  } catch {
    // Maybe it was hard-deleted or already restored
    return NextResponse.json({ error: "file not found in trash" }, { status: 404 });
  }
}

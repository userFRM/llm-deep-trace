import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const filePath = body.filePath as string | undefined;

  if (!filePath) {
    return NextResponse.json({ error: "filePath required" }, { status: 400 });
  }

  // Safety: the path must contain the sessionId
  if (!filePath.includes(sessionId)) {
    return NextResponse.json({ error: "session/path mismatch" }, { status: 400 });
  }

  try {
    // Move to .trash inside the same project folder (recoverable)
    const trashDir = path.join(path.dirname(filePath), ".trash");
    await fs.mkdir(trashDir, { recursive: true });
    await fs.rename(filePath, path.join(trashDir, path.basename(filePath)));
    return NextResponse.json({ ok: true });
  } catch {
    // Cross-device or other error — fall back to actual delete
    try {
      await fs.rm(filePath, { force: true });
      return NextResponse.json({ ok: true });
    } catch (e2) {
      return NextResponse.json({ error: String(e2) }, { status: 500 });
    }
  }
}

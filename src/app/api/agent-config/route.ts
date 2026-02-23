import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME || "/root";
const CONFIG_PATH = path.join(HOME, ".llm-deep-trace.json");

export async function GET() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
    }
  } catch { /* ignore */ }
  return NextResponse.json({});
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { [agentId]: { binaryPath?: string; sessionsDir?: string } }
    let existing: Record<string, unknown> = {};
    try {
      if (fs.existsSync(CONFIG_PATH)) existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch { /* ignore */ }
    const merged = { ...existing, ...body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

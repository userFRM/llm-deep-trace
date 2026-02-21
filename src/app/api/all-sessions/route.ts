import { NextResponse } from "next/server";
import {
  listKovaSessions,
  listClaudeSessions,
  listCodexSessions,
} from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const kova = listKovaSessions();
  const claude = listClaudeSessions();
  const codex = listCodexSessions();

  const merged = [...kova, ...claude, ...codex];
  merged.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return NextResponse.json(merged);
}

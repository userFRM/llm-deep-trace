import { NextResponse } from "next/server";
import { loadSessionsIndex } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  try {
    const index = loadSessionsIndex();
    if (key in index) {
      return NextResponse.json({
        sessionId: (index[key] as Record<string, unknown>).sessionId,
        key,
      });
    }
  } catch {
    // ignore
  }
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

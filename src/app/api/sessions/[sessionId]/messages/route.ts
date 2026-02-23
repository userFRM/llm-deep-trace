import { NextResponse } from "next/server";
import { getSessionMessages } from "@/lib/sessions";

export const dynamic = "force-dynamic";

// Cap any single string value at this length before sending to the browser.
// Large tool results (file reads, bash output) are the main offender.
const MAX_CHARS = 6000;

function truncateDeep(value: unknown, path = ""): unknown {
  if (typeof value === "string") {
    if (value.length > MAX_CHARS) {
      return value.slice(0, MAX_CHARS) + `\n\n… [truncated — ${Math.round(value.length / 1024)}KB total]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => truncateDeep(v));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncateDeep(v, path ? `${path}.${k}` : k);
    }
    return out;
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const url = new URL(_request.url);
  const source = url.searchParams.get("source") || "kova";
  const full = url.searchParams.get("full") === "1"; // opt-in to untruncated

  const entries = getSessionMessages(sessionId, source);
  if (!entries) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = full ? entries : truncateDeep(entries);
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { getSessionMessages } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const source = new URL(_request.url).searchParams.get("source") || "kova";
  const entries = getSessionMessages(sessionId, source);
  if (!entries) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(entries);
}

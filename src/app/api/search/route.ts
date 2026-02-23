import { NextResponse } from "next/server";
import { searchSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query as string) || "";
    if (query.length < 2) {
      return NextResponse.json([]);
    }
    const results = searchSessions(query, 50);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }
  const results = searchSessions(q, 50);
  return NextResponse.json(results);
}

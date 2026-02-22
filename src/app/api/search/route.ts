import { NextResponse } from "next/server";
import { searchSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query as string) || "";
    if (query.length < 3) {
      return NextResponse.json([]);
    }
    const results = searchSessions(query, 20);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

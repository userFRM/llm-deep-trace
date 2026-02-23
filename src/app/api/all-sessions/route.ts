import { NextResponse } from "next/server";
import { getAllSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const merged = getAllSessions();
  return NextResponse.json(merged);
}

import { NextResponse } from "next/server";
import { lookupPlaceBoundary } from "@/lib/nyc/boundaries";
import type { PlaceBoundary } from "@/lib/geo/polygon";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json(null satisfies PlaceBoundary | null);
  try {
    const boundary = await lookupPlaceBoundary(query);
    return NextResponse.json(boundary);
  } catch {
    return NextResponse.json(null);
  }
}

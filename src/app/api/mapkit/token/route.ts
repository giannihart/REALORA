import { NextResponse } from "next/server";
import { createMapKitToken, mapkitConfigured } from "@/lib/mapkit/token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!mapkitConfigured()) {
    return new NextResponse("MapKit is not configured", { status: 503 });
  }
  try {
    const token = createMapKitToken(request);
    if (!token) {
      return new NextResponse("MapKit is not configured", { status: 503 });
    }
    return new NextResponse(token, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "token error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

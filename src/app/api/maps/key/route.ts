import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mapsKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
}

export async function GET() {
  const key = mapsKey();
  if (!key) {
    return NextResponse.json({ error: "Google Maps is not configured" }, { status: 503 });
  }
  return NextResponse.json(
    { key },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

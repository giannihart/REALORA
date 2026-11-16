import { NextResponse } from "next/server";
import { geosearchAddress, geosearchAutocomplete } from "@/lib/nyc/geosearch";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "";
  const autocomplete = url.searchParams.get("autocomplete") === "1";
  const hits = autocomplete
    ? await geosearchAutocomplete(text, 8)
    : await geosearchAddress(text, 8);
  return NextResponse.json(hits);
}

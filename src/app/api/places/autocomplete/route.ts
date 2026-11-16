import { NextResponse } from "next/server";
import type { PlaceSuggestion } from "@/lib/google-maps/places";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "street_address",
  "premise",
  "subpremise",
  "route",
  "intersection",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "locality",
]);

type PlacePrediction = {
  placeId?: string;
  types?: string[];
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

function mapsKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
}

function formatLabel(main: string, secondary: string) {
  const place = secondary.replace(/,?\s*USA$/i, "").trim();
  return place ? `${main}, ${place}` : main;
}

function fromPrediction(prediction: PlacePrediction): PlaceSuggestion | null {
  const types = prediction.types ?? [];
  if (!types.some((type) => ALLOWED.has(type))) return null;
  const main = prediction.structuredFormat?.mainText?.text?.trim() || "";
  const secondary = prediction.structuredFormat?.secondaryText?.text?.trim() || "";
  const label = formatLabel(main || prediction.text?.text || "", secondary);
  if (!label) return null;
  return {
    id: prediction.placeId || label,
    label,
    main: main || label,
    secondary: secondary.replace(/,?\s*USA$/i, "").trim(),
  };
}

async function googleSuggestions(input: string, types?: string[]): Promise<PlacePrediction[]> {
  const key = mapsKey();
  if (!key) return [];
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["us"],
  };
  if (types?.length) body.includedPrimaryTypes = types;
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.types,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as {
    suggestions?: Array<{ placePrediction?: PlacePrediction }>;
  };
  return (payload.suggestions ?? [])
    .map((row) => row.placePrediction)
    .filter((row): row is PlacePrediction => row != null);
}

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text") ?? "";
  const query = text.trim();
  if (query.length < 2) return NextResponse.json([] satisfies PlaceSuggestion[]);

  const looksLikeAddress = /^\d/.test(query);
  const groups = looksLikeAddress
    ? [googleSuggestions(query, ["street_address", "premise", "route"])]
    : [googleSuggestions(query, ["locality", "neighborhood", "sublocality"])];

  const batches = await Promise.all(groups);
  const seen = new Set<string>();
  const hits: PlaceSuggestion[] = [];
  for (const prediction of batches.flat()) {
    const place = fromPrediction(prediction);
    if (!place) continue;
    const keyLabel = place.label.toLowerCase();
    if (seen.has(keyLabel)) continue;
    seen.add(keyLabel);
    hits.push(place);
    if (hits.length >= 8) break;
  }

  return NextResponse.json(hits);
}

import {
  asBoundaryGeometry,
  isCitywideLocation,
  unionGeometries,
  type BoundaryGeometry,
  type PlaceBoundary,
} from "@/lib/geo/polygon";
import {
  SOCRATA_DATASETS,
  socrataGeoJsonUrl,
  socrataHeaders,
  socrataResourceUrl,
} from "@/lib/nyc/opendata";

type NtaIndexRow = { ntaname: string; boroname: string };

const CITY_DROP =
  /\b(new york city|new york|nyc|ny|usa|united states)\b/gi;
const BOROUGH_DROP = /\b(manhattan|brooklyn|queens|bronx|the bronx|staten island)\b/gi;

const BOROUGHS: { key: string; name: string }[] = [
  { key: "manhattan", name: "Manhattan" },
  { key: "brooklyn", name: "Brooklyn" },
  { key: "queens", name: "Queens" },
  { key: "bronx", name: "Bronx" },
  { key: "the bronx", name: "Bronx" },
  { key: "staten island", name: "Staten Island" },
];

const ALIASES: Record<string, string> = {
  uws: "upper west side",
  ues: "upper east side",
  dumbo: "dumbo",
  soho: "soho",
  tribeca: "tribeca",
  "tri beca": "tribeca",
  noho: "noho",
  "no ho": "noho",
  fidi: "financial district",
};

let indexPromise: Promise<NtaIndexRow[]> | null = null;
const geomCache = new Map<string, BoundaryGeometry>();

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\./g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyAlias(value: string) {
  return ALIASES[value] ?? value;
}

function neighborhoodQuery(query: string) {
  return applyAlias(normalizeName(query.replace(CITY_DROP, " ").replace(BOROUGH_DROP, " ").replace(/,/g, " ")));
}

function fullQuery(query: string) {
  return applyAlias(normalizeName(query.replace(CITY_DROP, " ").replace(/,/g, " ")));
}

function ntaParts(name: string) {
  return normalizeName(name)
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreNta(query: string, ntaname: string) {
  const n = normalizeName(ntaname);
  if (!query || !n) return 0;
  if (n === query) return 100;
  if (n.startsWith(query) || query.startsWith(n)) return 90;
  const parts = ntaParts(ntaname);
  if (parts.some((part) => part === query)) return 85;
  if (parts.some((part) => part.startsWith(query) || query.startsWith(part))) return 70;
  if (n.includes(query) && query.length >= 5) return 50;
  return 0;
}

function matchedBorough(query: string) {
  const q = fullQuery(query);
  return BOROUGHS.find((row) => row.key === q)?.name ?? null;
}

async function loadNtaIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const url = new URL(socrataResourceUrl(SOCRATA_DATASETS.nta2020));
      url.searchParams.set("$select", "ntaname,boroname");
      url.searchParams.set("$limit", "400");
      const res = await fetch(url, { headers: socrataHeaders(), cache: "force-cache" });
      if (!res.ok) throw new Error("nta-index");
      const rows = (await res.json()) as NtaIndexRow[];
      return rows.filter((row) => row.ntaname);
    })().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

async function fetchNtaGeometries(names: string[]) {
  const missing = names.filter((name) => !geomCache.has(name));
  if (missing.length) {
    const quoted = missing.map((name) => `'${name.replace(/'/g, "''")}'`).join(",");
    const url = new URL(socrataGeoJsonUrl(SOCRATA_DATASETS.nta2020));
    url.searchParams.set("$where", `ntaname in (${quoted})`);
    url.searchParams.set("$limit", "80");
    const res = await fetch(url, { headers: socrataHeaders(), cache: "force-cache" });
    if (!res.ok) throw new Error("nta-geom");
    const payload = (await res.json()) as {
      features?: Array<{ properties?: { ntaname?: string }; geometry?: unknown }>;
    };
    for (const feature of payload.features ?? []) {
      const name = feature.properties?.ntaname;
      const geometry = asBoundaryGeometry(feature.geometry);
      if (name && geometry) geomCache.set(name, geometry);
    }
  }
  return names
    .map((name) => geomCache.get(name))
    .filter((geom): geom is BoundaryGeometry => geom != null);
}

function pickNtas(query: string, rows: NtaIndexRow[]) {
  const q = neighborhoodQuery(query);
  if (!q) return [];
  const scored = rows
    .map((row) => ({ row, score: scoreNta(q, row.ntaname) }))
    .filter((row) => row.score >= 70)
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score;
  if (!best) return [];
  const floor = best >= 90 ? 85 : best;
  return scored.filter((row) => row.score >= floor).map((row) => row.row);
}

async function nominatimBoundary(query: string): Promise<PlaceBoundary | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "REALORA/1.0 (map-boundaries)" },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const hits = (await res.json()) as Array<{
    display_name?: string;
    name?: string;
    geojson?: unknown;
    class?: string;
  }>;
  for (const hit of hits) {
    const geometry = asBoundaryGeometry(hit.geojson);
    if (!geometry) continue;
    const name = hit.name || hit.display_name?.split(",")[0] || query;
    return { name, geometry };
  }
  return null;
}

export async function lookupPlaceBoundary(query: string): Promise<PlaceBoundary | null> {
  const trimmed = query.trim();
  if (isCitywideLocation(trimmed)) return null;

  const borough = matchedBorough(trimmed);
  if (borough) {
    const fromOsm = await nominatimBoundary(`${borough}, New York, NY`).catch(() => null);
    if (fromOsm) return { name: borough, geometry: fromOsm.geometry };
  }

  try {
    const index = await loadNtaIndex();
    const matches = pickNtas(trimmed, index);
    if (matches.length) {
      const geometries = await fetchNtaGeometries(matches.map((row) => row.ntaname));
      const geometry = unionGeometries(geometries);
      if (geometry) {
        const name = matches.length === 1 ? matches[0]!.ntaname : neighborhoodQuery(trimmed);
        return { name, geometry };
      }
    }
  } catch {
    // Fall through to OpenStreetMap.
  }

  return nominatimBoundary(trimmed).catch(() => null);
}

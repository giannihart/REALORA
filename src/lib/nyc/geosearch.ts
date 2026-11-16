export type GeoSearchHit = {
  label: string;
  address: string;
  street: string;
  neighborhood: string;
  borough: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  bbl: string | null;
};

type PeliasFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    label?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    neighbourhood?: string;
    borough?: string;
    locality?: string;
    region_a?: string;
    postalcode?: string;
    pad_bbl?: string | number;
    addendum?: { pad?: { bbl?: string | number } };
  };
};

function asBbl(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function parseBbl(bbl: string): {
  bbl: string;
  boroughCode: number;
  boroughName: string;
  block: string;
  lot: string;
} | null {
  const digits = bbl.replace(/\D/g, "").padStart(10, "0").slice(-10);
  if (!/^[1-5]\d{9}$/.test(digits)) return null;
  const boroughCode = Number(digits[0]);
  const names = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
  return {
    bbl: digits,
    boroughCode,
    boroughName: names[boroughCode] ?? "New York",
    block: digits.slice(1, 6),
    lot: digits.slice(6, 10),
  };
}

function featureToHit(feature: PeliasFeature): GeoSearchHit | null {
  const props = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const bbl = asBbl(props.pad_bbl) ?? asBbl(props.addendum?.pad?.bbl);
  const street = props.street ?? "";
  const address =
    props.name ||
    [props.housenumber, street].filter(Boolean).join(" ") ||
    props.label ||
    "";
  if (!address.trim()) return null;
  return {
    label: props.label ?? address,
    address,
    street,
    neighborhood: props.neighbourhood ?? "",
    borough: props.borough ?? "",
    city: props.locality ?? "New York",
    state: props.region_a ?? "NY",
    zip: props.postalcode ?? "",
    lat,
    lng,
    bbl,
  };
}

function houseNumber(text: string): number | null {
  const match = text.trim().match(/^(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function streetName(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\d+[a-z]?\s+/i, "")
    .replace(/,.*$/, "")
    .replace(/[.]/g, "")
    .replace(/\b(street|st|avenue|ave|place|pl|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/g, " ")
    .replace(/\b(w|e|n|s)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BOROUGH_NAMES = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

function boroughFromQuery(query: string): string | null {
  const lower = query.toLowerCase();
  return BOROUGH_NAMES.find((name) => lower.includes(name.toLowerCase())) ?? null;
}

function hasCardinal(text: string): string | null {
  const match = text.toLowerCase().match(/\b(east|west|north|south)\b/);
  return match?.[1] ?? null;
}

/** Hits that share the query's house number; otherwise the single pickBestGeoHit. */
export function hitsForAddress(hits: GeoSearchHit[], query: string): GeoSearchHit[] {
  const borough = boroughFromQuery(query);
  const inBorough = borough
    ? hits.filter((hit) => hit.borough.toLowerCase() === borough.toLowerCase())
    : hits;
  const pool = inBorough.length ? inBorough : hits;
  const want = houseNumber(query);
  if (want == null) return pool;
  const wantStreet = streetName(query);
  const wantCardinal = hasCardinal(query);
  const exact = pool.filter((hit) => {
    const n = houseNumber(hit.address || hit.label);
    if (n !== want) return false;
    // Reject hyphenated Queens-style house numbers when the query is a simple integer.
    if (/^\d+-\d+/.test((hit.address || hit.label).trim()) && !/^\d+-\d+/.test(query.trim())) {
      return false;
    }
    if (wantCardinal) {
      const hitCardinal = hasCardinal(`${hit.street} ${hit.address} ${hit.label}`);
      if (hitCardinal && hitCardinal !== wantCardinal) return false;
    }
    if (!wantStreet) return true;
    const street = streetName(hit.street || hit.address || hit.label);
    if (!street) return false;
    return (
      street === wantStreet ||
      street.includes(wantStreet) ||
      wantStreet.includes(street)
    );
  });
  if (exact.length) return exact;
  const best = pickBestGeoHit(pool, query);
  return best ? [best] : [];
}

/** Prefer the exact house number, otherwise interpolate along the same street. */
export function pickBestGeoHit(hits: GeoSearchHit[], query: string): GeoSearchHit | null {
  if (!hits.length) return null;
  const want = houseNumber(query);
  if (want == null) return hits[0];
  const wantStreet = streetName(query);
  const numbered = hits
    .map((hit) => ({
      hit,
      n: houseNumber(hit.address || hit.label),
      street: streetName(hit.street || hit.address || hit.label),
    }))
    .filter((row): row is { hit: GeoSearchHit; n: number; street: string } => row.n != null);
  const sameStreet = wantStreet
    ? numbered.filter(
        (row) =>
          row.street === wantStreet ||
          row.street.includes(wantStreet) ||
          wantStreet.includes(row.street),
      )
    : numbered;
  const pool = sameStreet.length ? sameStreet : numbered;
  const exact = pool.find((row) => row.n === want);
  if (exact) return exact.hit;
  const lower = pool.filter((row) => row.n < want).sort((a, b) => b.n - a.n)[0];
  const upper = pool.filter((row) => row.n > want).sort((a, b) => a.n - b.n)[0];
  if (lower && upper && upper.n !== lower.n) {
    const t = (want - lower.n) / (upper.n - lower.n);
    return {
      ...lower.hit,
      address: query,
      label: query,
      lat: lower.hit.lat + (upper.hit.lat - lower.hit.lat) * t,
      lng: lower.hit.lng + (upper.hit.lng - lower.hit.lng) * t,
    };
  }
  return (upper ?? lower)?.hit ?? hits[0];
}

type PeliasOpts = {
  signal?: AbortSignal;
  throwOnError?: boolean;
};

async function fetchPelias(
  path: "search" | "autocomplete",
  text: string,
  size: number,
  minLength: number,
  opts: PeliasOpts = {},
): Promise<GeoSearchHit[]> {
  const trimmed = text.trim();
  if (trimmed.length < minLength) return [];
  const url = new URL(`https://geosearch.planninglabs.nyc/v2/${path}`);
  url.searchParams.set("text", trimmed);
  url.searchParams.set("size", String(size));
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) {
    if (opts.throwOnError) {
      throw new Error(`geosearch ${res.status}`);
    }
    return [];
  }
  const body = (await res.json()) as { features?: PeliasFeature[] };
  return (body.features ?? [])
    .map(featureToHit)
    .filter((hit): hit is GeoSearchHit => hit != null);
}

export async function geosearchAddress(
  text: string,
  size = 8,
  opts: PeliasOpts = {},
): Promise<GeoSearchHit[]> {
  return fetchPelias("search", text, size, 3, opts);
}

export async function geosearchAutocomplete(
  text: string,
  size = 8,
  opts: PeliasOpts = {},
): Promise<GeoSearchHit[]> {
  return fetchPelias("autocomplete", text, size, 2, opts);
}

export async function geosearchBestAddress(text: string): Promise<GeoSearchHit | null> {
  const hits = await geosearchAddress(text, 8);
  return pickBestGeoHit(hits, text);
}

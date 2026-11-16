import { pickBestGeoHit, type GeoSearchHit } from "@/lib/nyc/geosearch";

export type MappableListing = {
  id: string;
  address: string;
  neighborhood?: string;
  borough?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
};

const cache = new Map<string, { lat: number; lng: number }>();
let googleGeocoderDenied = false;

function cleanAddress(address: string) {
  return address.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function listingAddressQuery(listing: MappableListing) {
  const city = listing.city?.trim() || "New York";
  const state = listing.state?.trim() || "NY";
  return [cleanAddress(listing.address), listing.borough || listing.neighborhood, city, state, listing.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function geocodeWithGoogle(
  maps: typeof google.maps,
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (googleGeocoderDenied || !maps.Geocoder) {
      resolve(null);
      return;
    }
    const geocoder = new maps.Geocoder();
    const bounds = new maps.LatLngBounds({ lat: 40.49, lng: -74.26 }, { lat: 40.92, lng: -73.7 });
    geocoder.geocode(
      {
        address,
        bounds,
        componentRestrictions: { country: "US" },
        region: "us",
      },
      (results, status) => {
        if (status === "REQUEST_DENIED") googleGeocoderDenied = true;
        const loc = status === "OK" ? results?.[0]?.geometry?.location : null;
        if (!loc) {
          resolve(null);
          return;
        }
        resolve({ lat: loc.lat(), lng: loc.lng() });
      },
    );
  });
}

async function geocodeWithNyc(listing: MappableListing): Promise<{ lat: number; lng: number } | null> {
  const address = cleanAddress(listing.address);
  const query = [address, listing.borough].filter(Boolean).join(", ");
  try {
    const res = await fetch(`/api/geosearch?text=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const hits = (await res.json()) as GeoSearchHit[];
    const hit = pickBestGeoHit(hits, address || query);
    if (!hit) return null;
    return { lat: hit.lat, lng: hit.lng };
  } catch {
    return null;
  }
}

function storedCoordinate(listing: MappableListing): { lat: number; lng: number } | null {
  if (
    listing.lat != null &&
    listing.lng != null &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  ) {
    return { lat: listing.lat, lng: listing.lng };
  }
  return null;
}

export async function geocodeListing(
  maps: typeof google.maps,
  listing: MappableListing,
): Promise<{ lat: number; lng: number } | null> {
  const query = listingAddressQuery(listing);
  const cached = cache.get(query) ?? cache.get(cleanAddress(listing.address));
  if (cached) return cached;

  const nycHit = await geocodeWithNyc(listing);
  if (nycHit) {
    cache.set(query, nycHit);
    return nycHit;
  }

  const googleHit = await geocodeWithGoogle(maps, query);
  if (googleHit) {
    cache.set(query, googleHit);
    return googleHit;
  }

  return storedCoordinate(listing);
}

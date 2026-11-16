/**
 * Static-map calibration for /buy pins.
 *
 * The marketplace map is a cropped Manhattan raster. Seed listing pins were
 * placed by hand; these bounds are a linear fit of those pin percentages
 * against the GeoSearch lat/lng of the same addresses (2026-10-29):
 *
 *   18 Grove Street          40.7331, -74.0050  →  x:22 y:62
 *   141 Greene Street        40.7253, -73.9974  →  x:30 y:78
 *   520 West 28th Street     40.7516, -74.0042  →  x:20 y:18
 *   78 Pierrepont Street     40.6955, -73.9935  →  x:52 y:24
 *   212 Carlton Avenue       40.6897, -73.9726  →  x:40 y:68
 *   88 Prospect Park West    40.6624, -73.9695  →  x:58 y:48
 *   412 2nd Street           40.6724, -73.9793  →  x:44 y:72
 *
 * Seed listings keep their authored pin in acris_payload; new listings
 * convert stored lat/lng through these bounds.
 */
export const MAP_BOUNDS = {
  north: 40.768,
  south: 40.648,
  west: -74.02,
  east: -73.95,
} as const;

export function latLngToPin(lat: number, lng: number): { x: number; y: number } {
  const { north, south, west, east } = MAP_BOUNDS;
  const x = ((lng - west) / (east - west)) * 100;
  const y = ((north - lat) / (north - south)) * 100;
  return {
    x: Math.min(94, Math.max(6, x)),
    y: Math.min(90, Math.max(10, y)),
  };
}

export const NYC_REGION = {
  center: { lat: 40.72, lng: -73.99 },
  span: { lat: 0.12, lng: 0.14 },
} as const;

/** NYC Planning Labs GeoSearch (PAD) coordinates for seed addresses. */
export const KNOWN_LISTING_COORDS: Record<string, { lat: number; lng: number }> = {
  "18-grove-street": { lat: 40.732309, lng: -74.005498 },
  "141-greene-street": { lat: 40.726004, lng: -73.998808 },
  "520-west-28th-street": { lat: 40.751, lng: -74.002943 },
  "78-pierrepont-street": { lat: 40.695787, lng: -73.994362 },
  "212-carlton-avenue": { lat: 40.691289, lng: -73.972777 },
  "88-prospect-park-west": { lat: 40.667639, lng: -73.97468 },
  "412-2nd-street": { lat: 40.672521, lng: -73.981437 },
};

export function pinToLatLng(x: number, y: number): { lat: number; lng: number } {
  const { north, south, west, east } = MAP_BOUNDS;
  return {
    lat: north - (y / 100) * (north - south),
    lng: west + (x / 100) * (east - west),
  };
}

export function listingCoordinate(listing: {
  id?: string;
  lat?: number | null;
  lng?: number | null;
  pin: { x: number; y: number };
}): { lat: number; lng: number } {
  if (
    listing.lat != null &&
    listing.lng != null &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  ) {
    return { lat: listing.lat, lng: listing.lng };
  }
  if (listing.id && KNOWN_LISTING_COORDS[listing.id]) {
    return KNOWN_LISTING_COORDS[listing.id];
  }
  return pinToLatLng(listing.pin.x, listing.pin.y);
}

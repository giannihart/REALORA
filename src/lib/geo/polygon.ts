export type Ring = number[][];
export type PolygonCoords = Ring[];
export type MultiPolygonCoords = PolygonCoords[];

export type PolygonGeometry = { type: "Polygon"; coordinates: PolygonCoords };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: MultiPolygonCoords };
export type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry;

export type PlaceBoundary = {
  name: string;
  geometry: BoundaryGeometry;
};

export const FOREST_MAP = "#102c25";

export function isCitywideLocation(query: string) {
  const q = query.trim();
  return !q || /^(new york|new york, ny|ny|nyc)$/i.test(q);
}

function isLngLat(point: unknown): point is number[] {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
  );
}

function isRing(ring: unknown): ring is Ring {
  return Array.isArray(ring) && ring.length >= 3 && ring.every(isLngLat);
}

function isPolygonCoords(coords: unknown): coords is PolygonCoords {
  return Array.isArray(coords) && coords.length > 0 && coords.every(isRing);
}

export function asBoundaryGeometry(value: unknown): BoundaryGeometry | null {
  if (!value || typeof value !== "object") return null;
  const geom = value as { type?: string; coordinates?: unknown };
  if (geom.type === "Polygon" && isPolygonCoords(geom.coordinates)) {
    return { type: "Polygon", coordinates: geom.coordinates };
  }
  if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    const polygons = geom.coordinates.filter(isPolygonCoords);
    if (!polygons.length) return null;
    return { type: "MultiPolygon", coordinates: polygons };
  }
  return null;
}

export function unionGeometries(geometries: BoundaryGeometry[]): BoundaryGeometry | null {
  const coordinates: MultiPolygonCoords = [];
  for (const geom of geometries) {
    if (geom.type === "Polygon") coordinates.push(geom.coordinates);
    else coordinates.push(...geom.coordinates);
  }
  if (!coordinates.length) return null;
  return { type: "MultiPolygon", coordinates };
}

function pointInRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, rings: PolygonCoords) {
  const outer = rings[0];
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  for (let i = 1; i < rings.length; i += 1) {
    const hole = rings[i];
    if (hole && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

export function pointInGeometry(lat: number, lng: number, geometry: BoundaryGeometry) {
  if (geometry.type === "Polygon") return pointInPolygonCoords(lng, lat, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygonCoords(lng, lat, polygon));
}

export function extendBoundsFromGeometry(
  extend: (point: { lat: number; lng: number }) => void,
  geometry: BoundaryGeometry,
) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring) continue;
    for (const point of ring) {
      const lng = point[0];
      const lat = point[1];
      if (lng == null || lat == null) continue;
      extend({ lat, lng });
    }
  }
}

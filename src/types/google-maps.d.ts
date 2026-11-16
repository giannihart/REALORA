export {};

declare global {
  namespace google.maps {
    type MapTypeStyle = {
      featureType?: string;
      elementType?: string;
      stylers?: Array<Record<string, string | number | boolean>>;
    };

    type LatLngLiteral = { lat: number; lng: number };

    type Padding = { top?: number; right?: number; bottom?: number; left?: number };

    type MapOptions = {
      center?: LatLngLiteral;
      zoom?: number;
      disableDefaultUI?: boolean;
      clickableIcons?: boolean;
      gestureHandling?: string;
      styles?: MapTypeStyle[];
      backgroundColor?: string;
      minZoom?: number;
      maxZoom?: number;
    };

    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    class LatLngBounds {
      constructor(sw?: LatLng | LatLngLiteral, ne?: LatLng | LatLngLiteral);
      extend(point: LatLng | LatLngLiteral): LatLngBounds;
      isEmpty(): boolean;
    }

    class Map {
      constructor(element: HTMLElement, opts?: MapOptions);
      data: Data;
      setZoom(zoom: number): void;
      getZoom(): number | undefined;
      panTo(latLng: LatLng | LatLngLiteral): void;
      fitBounds(bounds: LatLngBounds, padding?: number | Padding): void;
    }

    namespace Data {
      type StyleOptions = {
        fillColor?: string;
        fillOpacity?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeWeight?: number;
        clickable?: boolean;
        visible?: boolean;
        zIndex?: number;
      };
      class Feature {}
    }

    class Data {
      addGeoJson(geoJson: object): Data.Feature[];
      forEach(callback: (feature: Data.Feature) => void): void;
      remove(feature: Data.Feature): void;
      setStyle(style: Data.StyleOptions): void;
    }

    interface MapPanes {
      overlayMouseTarget: Element;
    }

    interface MapCanvasProjection {
      fromLatLngToDivPixel(latLng: LatLng | LatLngLiteral | null): { x: number; y: number } | null;
    }

    class OverlayView {
      setMap(map: Map | null): void;
      getPanes(): MapPanes | null;
      getProjection(): MapCanvasProjection;
      onAdd(): void;
      draw(): void;
      onRemove(): void;
      static preventMapHitsAndGesturesFrom(element: Element): void;
    }

    type GeocoderRequest = {
      address?: string;
      region?: string;
      bounds?: LatLngBounds;
      componentRestrictions?: {
        country?: string;
        administrativeArea?: string;
        locality?: string;
        postalCode?: string;
      };
    };

    type GeocoderResult = {
      formatted_address: string;
      geometry: { location: LatLng };
    };

    class Geocoder {
      geocode(
        request: GeocoderRequest,
        callback: (results: GeocoderResult[] | null, status: string) => void,
      ): void;
    }
  }

  interface Window {
    google?: { maps: typeof google.maps };
  }
}

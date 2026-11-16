export {};

declare global {
  interface Window {
    mapkit?: typeof mapkit;
    initMapKit?: () => void;
  }

  namespace mapkit {
    function init(options: {
      authorizationCallback: (done: (token: string) => void) => void;
      language?: string;
    }): void;
    function addEventListener(type: "configuration-change" | "error", listener: (event?: unknown) => void): void;
    function removeEventListener(type: "configuration-change" | "error", listener: (event?: unknown) => void): void;
    const loadedLibraries: string[];

    class Coordinate {
      constructor(latitude: number, longitude: number);
      latitude: number;
      longitude: number;
    }

    class CoordinateSpan {
      constructor(latitudeDelta: number, longitudeDelta: number);
      latitudeDelta: number;
      longitudeDelta: number;
    }

    class CoordinateRegion {
      constructor(center: Coordinate, span: CoordinateSpan);
      center: Coordinate;
      span: CoordinateSpan;
    }

    class Padding {
      constructor(top: number, right: number, bottom: number, left: number);
    }

    class Map {
      constructor(
        parent?: string | HTMLElement,
        options?: {
          region?: CoordinateRegion;
          mapType?: string;
          colorScheme?: string;
          isRotationEnabled?: boolean;
          isScrollEnabled?: boolean;
          isZoomEnabled?: boolean;
          showsMapTypeControl?: boolean;
          showsZoomControl?: boolean;
          showsCompass?: string | boolean;
          showsScale?: string | boolean;
          showsPointsOfInterest?: boolean;
          padding?: Padding;
        },
      );
      region: CoordinateRegion;
      element: HTMLElement;
      addAnnotation(annotation: Annotation): Annotation;
      removeAnnotation(annotation: Annotation): Annotation;
      removeAnnotations(annotations: Annotation[]): void;
      showItems(
        items: Annotation[],
        options?: { animate?: boolean; padding?: Padding; minimumSpan?: CoordinateSpan },
      ): void;
      setRegionAnimated(region: CoordinateRegion, animate?: boolean): void;
      destroy(): void;
      static MapTypes: { Standard: string; MutedStandard: string; Satellite: string; Hybrid: string };
      static ColorSchemes: { Light: string; Dark: string };
    }

    class Annotation {
      constructor(
        coordinate: Coordinate,
        factory: (coordinate: Coordinate, options: AnnotationConstructorOptions) => HTMLElement,
        options?: AnnotationConstructorOptions,
      );
      data: unknown;
      selected: boolean;
      title: string;
      element?: HTMLElement;
      addEventListener(type: "select" | "deselect", listener: () => void): void;
    }

    interface AnnotationConstructorOptions {
      title?: string;
      subtitle?: string;
      data?: unknown;
      calloutEnabled?: boolean;
      animates?: boolean;
      displayPriority?: number;
      selected?: boolean;
    }

    const FeatureVisibility: { Hidden: string; Visible: string; Adaptive: string };
  }
}

const SCRIPT_SRC = "https://maps.googleapis.com/maps/api/js";

let loading: Promise<typeof google.maps> | null = null;

export class MapsConfigError extends Error {
  constructor() {
    super("Google Maps is not configured.");
    this.name = "MapsConfigError";
  }
}

async function resolveKey(): Promise<string> {
  const published = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (published) return published;
  const res = await fetch("/api/maps/key", { cache: "no-store" });
  if (res.status === 503) throw new MapsConfigError();
  if (!res.ok) throw new Error("maps-key");
  const body = (await res.json()) as { key?: string };
  const key = body.key?.trim();
  if (!key) throw new MapsConfigError();
  return key;
}

function injectScript(key: string) {
  if (window.google?.maps) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps="1"]');
    if (existing) {
      if (window.google?.maps) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("maps-script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `${SCRIPT_SRC}?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.dataset.googleMaps = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("maps-script"));
    document.head.appendChild(script);
  });
}

export function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is browser-only."));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loading) return loading;

  loading = (async () => {
    const key = await resolveKey();
    await injectScript(key);
    const maps = window.google?.maps;
    if (!maps) throw new Error("maps-missing");
    return maps;
  })().catch((error) => {
    loading = null;
    throw error;
  });

  return loading;
}

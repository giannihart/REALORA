const SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js";

let loading: Promise<typeof mapkit> | null = null;

function injectScript() {
  if (window.mapkit) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mapkit="1"]');
    if (existing) {
      if (window.mapkit) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("mapkit-script")), { once: true });
      return;
    }
    window.initMapKit = () => {
      delete window.initMapKit;
      resolve();
    };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.mapkit = "1";
    script.dataset.libraries = "map,annotations";
    script.dataset.callback = "initMapKit";
    script.onerror = () => reject(new Error("mapkit-script"));
    document.head.appendChild(script);
  });
}

export class MapKitConfigError extends Error {
  constructor() {
    super("Apple Maps is not configured.");
    this.name = "MapKitConfigError";
  }
}

export function loadMapKit() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapKit is browser-only."));
  }
  if (window.mapkit?.loadedLibraries?.length) return Promise.resolve(window.mapkit);
  if (loading) return loading;

  loading = (async () => {
    const tokenRes = await fetch("/api/mapkit/token", { cache: "no-store" });
    if (tokenRes.status === 503) throw new MapKitConfigError();
    if (!tokenRes.ok) throw new Error("mapkit-token");
    const token = (await tokenRes.text()).trim();
    await injectScript();
    const kit = window.mapkit;
    if (!kit) throw new Error("mapkit-missing");

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        kit.removeEventListener("configuration-change", onReady);
        kit.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        kit.removeEventListener("configuration-change", onReady);
        kit.removeEventListener("error", onError);
        reject(new Error("mapkit-init"));
      };
      kit.addEventListener("configuration-change", onReady);
      kit.addEventListener("error", onError);
      try {
        kit.init({
          authorizationCallback: (done) => done(token),
          language: "en",
        });
      } catch {
        onReady();
      }
      if (kit.loadedLibraries?.length) onReady();
    });

    return kit;
  })().catch((error) => {
    loading = null;
    throw error;
  });

  return loading;
}

import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const CHROME =
  "/var/folders/pk/cy2198c50l5c13h6fspjd4l40000gn/T/cursor-sandbox-cache/f12ee81b201298037710e7c909591514/playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const ROUTES = [
  "/",
  "/buy",
  "/listing/412-2nd-street",
  "/portal/buyer",
  "/portal/seller/offers",
];

const outDir = path.join(process.cwd(), ".lighthouse");
await mkdir(outDir, { recursive: true });

function run(url, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      "lighthouse",
      url,
      "--only-categories=performance",
      "--preset=desktop",
      "--output=json",
      `--output-path=${outFile}`,
      "--quiet",
      "--disable-full-page-screenshot",
      `--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage`,
    ];
    const env = { ...process.env, CHROME_PATH: CHROME };
    const child = spawn("npx", args, { env, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`lighthouse exited ${code} for ${url}`));
    });
  });
}

function kb(bytes) {
  return Math.round(bytes / 1024);
}

const rows = [];
for (const route of ROUTES) {
  const slug = route === "/" ? "home" : route.replaceAll("/", "_").slice(1);
  const outFile = path.join(outDir, `${slug}.json`);
  const url = `http://127.0.0.1:3000${route}`;
  console.error(`\n=== ${route} ===`);
  await run(url, outFile);
  const report = JSON.parse(await readFile(outFile, "utf8"));
  const audits = report.audits;
  const reqs = audits["network-requests"]?.details?.items ?? [];
  const jsBytes = reqs
    .filter((i) => i.resourceType === "Script")
    .reduce((n, i) => n + (i.transferSize || 0), 0);
  const row = {
    route,
    score: Math.round((report.categories.performance.score ?? 0) * 100),
    lcp: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
    inp: audits["interaction-to-next-paint"]?.numericValue ?? audits["experimental-interaction-to-next-paint"]?.numericValue ?? null,
    cls: Number((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    tbt: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
    jsKB: kb(jsBytes),
    lcpEl: audits["largest-contentful-paint-element"]?.displayValue ?? "",
  };
  rows.push(row);
  console.error(JSON.stringify(row));
}

console.log(JSON.stringify(rows, null, 2));

import { NextResponse } from "next/server";
import { lookupPublicAcris } from "@/lib/services/acris";
import type {
  AcrisDiagnostics,
  AcrisDiagnosticsPublic,
  PublicAcrisLookup,
} from "@/lib/services/acris-types";

export const dynamic = "force-dynamic";

/** Condo unit resolution routinely needs 8–15s of Socrata round-trips. */
const LOOKUP_MS = 25_000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const ADDRESS_MAX = 200;
const isProd = process.env.NODE_ENV === "production";

const cache = new Map<string, { expires: number; body: PublicAcrisLookup }>();

function cacheKey(address: string, borough: string | null, unit: string | null, bbl?: string) {
  const addr = address.trim().toLowerCase().replace(/\s+/g, " ");
  const boro = (borough ?? "").toLowerCase();
  const u = (unit ?? "").toLowerCase();
  return bbl ? `v7:${addr}|${boro}|${u}|${bbl}` : `v7:${addr}|${boro}|${u}`;
}

function cacheGet(key: string): PublicAcrisLookup | null {
  const row = cache.get(key);
  if (!row) return null;
  if (row.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.body;
}

function asAddress(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, ADDRESS_MAX);
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asBbl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return undefined;
  return digits;
}

function slimDiagnostics(diag: AcrisDiagnostics): AcrisDiagnosticsPublic {
  return {
    resolved: diag.resolved
      ? { address: diag.resolved.address, bbl: diag.resolved.bbl }
      : null,
    reason: diag.reason,
  };
}

function toClientBody(result: PublicAcrisLookup) {
  if (!isProd) return result;
  const diagnostics = slimDiagnostics(result.diagnostics);
  if (result.status === "match") {
    return { status: "match", record: result.record, diagnostics };
  }
  if (result.status === "multiple") {
    return { status: "multiple", candidates: result.candidates, diagnostics };
  }
  return { status: "none", diagnostics };
}

function logLookup(result: PublicAcrisLookup) {
  const d = result.diagnostics;
  console.info(
    JSON.stringify({
      event: "acris-lookup",
      status: result.status,
      input: d.input,
      borough: d.borough,
      resolved: d.resolved,
      counts: d.counts,
      reason: d.reason,
    }),
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  const row = body as {
    address?: unknown;
    bbl?: unknown;
    borough?: unknown;
    unit?: unknown;
    addresses?: unknown;
  };
  if (row.addresses != null || Array.isArray(row.address)) {
    return NextResponse.json({ error: "One address per request." }, { status: 400 });
  }

  const address = asAddress(row.address);
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }
  const borough = asOptionalString(row.borough);
  const unit = asOptionalString(row.unit);
  const bbl = asBbl(row.bbl);
  const key = cacheKey(address, borough, unit, bbl);
  const cached = cacheGet(key);
  if (cached) {
    logLookup(cached);
    return NextResponse.json(toClientBody(cached), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
  try {
    const result = await lookupPublicAcris(address, {
      bbl,
      borough,
      unit,
      signal: controller.signal,
    });
    cache.set(key, { expires: Date.now() + CACHE_MS, body: result });
    logLookup(result);
    return NextResponse.json(toClientBody(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error";
    const diagnostics: AcrisDiagnostics = {
      input: address,
      borough,
      resolved: null,
      counts: { master: 0, legals: 0, parties: 0 },
      reason: "upstream_error",
    };
    console.error(
      JSON.stringify({
        event: "acris-lookup",
        status: "unavailable",
        input: address,
        borough,
        reason: "upstream_error",
        error: reason,
      }),
    );
    return NextResponse.json(
      {
        status: "unavailable",
        diagnostics: isProd ? slimDiagnostics(diagnostics) : diagnostics,
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}

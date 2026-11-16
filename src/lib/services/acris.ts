import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { geosearchAddress, hitsForAddress, parseBbl, type GeoSearchHit } from "@/lib/nyc/geosearch";
import { SOCRATA_DATASETS, socrataHeaders, socrataResourceUrl } from "@/lib/nyc/opendata";
import type { Json } from "@/lib/database.types";
import type {
  AcrisDiagnostics,
  AcrisLookupReason,
  LastDeed,
  LastSale,
  PropertyRecord,
  PublicAcrisCandidate,
  PublicAcrisLookup,
  PublicAcrisRecord,
} from "@/lib/services/acris-types";

export type {
  AcrisDiagnostics,
  AcrisLookupReason,
  LastDeed,
  LastSale,
  PropertyRecord,
  PublicAcrisCandidate,
  PublicAcrisLookup,
  PublicAcrisRecord,
};

export type LookupPropertyResult = PropertyRecord | null;

type SocrataRow = Record<string, unknown>;

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type SocrataOpts = {
  signal?: AbortSignal;
  throwOnError?: boolean;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function socrataQuery(
  datasetId: string,
  params: Record<string, string>,
  opts: SocrataOpts = {},
): Promise<SocrataRow[]> {
  const url = new URL(socrataResourceUrl(datasetId));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const maxAttempts = 3;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error("This operation was aborted");
    }
    const res = await fetch(url, {
      headers: socrataHeaders(),
      signal: opts.signal,
      cache: opts.throwOnError ? "no-store" : "default",
    });
    if (res.ok) {
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? (body as SocrataRow[]) : [];
    }
    lastStatus = res.status;
    const retryable = res.status === 429 || res.status === 502 || res.status === 503;
    if (!retryable || attempt === maxAttempts) break;
    // Honor Retry-After when present; otherwise backoff 400/800ms.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 2_000)
      : 400 * attempt;
    try {
      await sleep(waitMs, opts.signal);
    } catch {
      throw new Error("This operation was aborted");
    }
  }
  if (opts.throwOnError) {
    throw new Error(`socrata ${datasetId} ${lastStatus || "error"}`);
  }
  return [];
}

function dollarsToCents(amount: unknown): number {
  const n = num(amount) ?? 0;
  return Math.round(n * 100);
}

function dateOnly(value: unknown): string {
  const raw = str(value);
  if (!raw) return "";
  return raw.slice(0, 10);
}

function isDeedType(docType: string): boolean {
  const t = docType.trim().toUpperCase();
  return t === "DEED" || t === "DEED, OTHER" || t.startsWith("DEED");
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.replace(/\s+/g, " ").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.replace(/\s+/g, " ").trim());
  }
  return out;
}

type FetchAcrisOpts = {
  signal?: AbortSignal;
  includeViolations?: boolean;
  throwOnError?: boolean;
};

function firstNonEmpty(rows: SocrataRow[], key: string): string | null {
  for (const row of rows) {
    const value = str(row[key]);
    if (value) return value;
  }
  return null;
}

type StageCounts = { master: number; legals: number; parties: number };

type AcrisFetchDetail = {
  record: PropertyRecord | null;
  counts: StageCounts;
  hasDeed: boolean;
};

const EMPTY_COUNTS: StageCounts = { master: 0, legals: 0, parties: 0 };

async function fetchAcrisDetail(
  hit: GeoSearchHit,
  opts: FetchAcrisOpts = {},
): Promise<AcrisFetchDetail> {
  if (!hit.bbl) return { record: null, counts: { ...EMPTY_COUNTS }, hasDeed: false };
  const parsed = parseBbl(hit.bbl);
  if (!parsed) return { record: null, counts: { ...EMPTY_COUNTS }, hasDeed: false };

  const borough = String(parsed.boroughCode);
  const block = String(Number(parsed.block));
  const lot = String(Number(parsed.lot));
  const blockPad = parsed.block;
  const lotPad = parsed.lot;
  const queryOpts: SocrataOpts = {
    signal: opts.signal,
    throwOnError: opts.throwOnError,
  };
  const counts: StageCounts = { ...EMPTY_COUNTS };

  const legals = await socrataQuery(
    SOCRATA_DATASETS.acrisLegals,
    {
      $select: "document_id,borough,block,lot,property_type,unit",
      $where: `borough=${borough} and block=${block} and lot=${lot}`,
      $limit: "5000",
    },
    queryOpts,
  );
  counts.legals = legals.length;
  if (!legals.length) {
    return { record: null, counts, hasDeed: false };
  }

  const documentIds = [
    ...new Set(legals.map((row) => str(row.document_id)).filter(Boolean)),
  ];
  const documentCount = documentIds.length;
  const propertyType = firstNonEmpty(legals, "property_type");

  let lastSale: LastSale | null = null;
  let lastDeed: LastDeed | null = null;
  let deedId: string | null = null;
  let masterRows = 0;

  for (let i = 0; i < documentIds.length; i += 40) {
    const batch = documentIds.slice(i, i + 40);
    const listed = batch.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const masters = await socrataQuery(
      SOCRATA_DATASETS.acrisMaster,
      {
        $select: "document_id,doc_type,document_amt,document_date,recorded_datetime",
        $where: `document_id in (${listed})`,
        $limit: "200",
      },
      queryOpts,
    );
    masterRows += masters.length;
    for (const row of masters) {
      if (!isDeedType(str(row.doc_type))) continue;
      const date = dateOnly(row.recorded_datetime) || dateOnly(row.document_date);
      if (!date) continue;
      if (!lastSale || date > lastSale.date) {
        lastSale = { date, amountCents: dollarsToCents(row.document_amt) };
        lastDeed = { type: str(row.doc_type), date };
        deedId = str(row.document_id) || deedId;
      }
    }
  }
  counts.master = masterRows;

  let ownersOfRecord: string[] = [];
  if (deedId) {
    const parties = await socrataQuery(
      SOCRATA_DATASETS.acrisParties,
      {
        $select: "name,party_type,document_id",
        $where: `document_id='${deedId.replace(/'/g, "''")}'`,
        $limit: "50",
      },
      queryOpts,
    );
    counts.parties = parties.length;
    const grantees = parties.filter((row) => {
      const t = str(row.party_type);
      return t === "2" || t.toUpperCase() === "GRANTEE";
    });
    const source = grantees.length ? grantees : parties;
    ownersOfRecord = uniqueNames(source.map((row) => str(row.name)).filter(Boolean));
  }

  let openViolations: number | null = null;
  if (opts.includeViolations !== false) {
    try {
      const where = [
        `(boro='${parsed.boroughName}' or upper(boro)='${parsed.boroughName.toUpperCase()}' or boro='${borough}')`,
        `(block='${block}' or block='${blockPad}')`,
        `(lot='${lot}' or lot='${lotPad}')`,
        `upper(violation_category) like '%OPEN%'`,
      ].join(" and ");
      const rows = await socrataQuery(
        SOCRATA_DATASETS.dobViolations,
        {
          $select: "count(1) as count",
          $where: where,
        },
        queryOpts,
      );
      const counted = num(rows[0]?.count);
      openViolations = counted;
    } catch {
      openViolations = null;
    }
  }

  const hasDeed = Boolean(lastDeed);
  return {
    counts,
    hasDeed,
    record: {
      bbl: parsed.bbl,
      normalizedAddress: hit.label || hit.address,
      lat: hit.lat,
      lng: hit.lng,
      borough: parsed.boroughName,
      block: parsed.block,
      lot: parsed.lot,
      propertyType,
      ownersOfRecord,
      lastSale: lastSale && lastSale.amountCents >= 0 ? lastSale : lastSale,
      lastDeed,
      documentCount,
      openViolations,
    },
  };
}

async function fetchAcrisRecord(
  hit: GeoSearchHit,
  opts: FetchAcrisOpts = {},
): Promise<PropertyRecord | null> {
  const detail = await fetchAcrisDetail(hit, opts);
  return detail.record;
}

function recordFromPayload(payload: Json | null, fallback: GeoSearchHit): PropertyRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const bbl = str(row.bbl) || fallback.bbl;
  if (!bbl) return null;
  const lastSaleRaw = row.lastSale;
  let lastSale: LastSale | null = null;
  if (lastSaleRaw && typeof lastSaleRaw === "object" && !Array.isArray(lastSaleRaw)) {
    const sale = lastSaleRaw as Record<string, unknown>;
    const date = str(sale.date);
    const amountCents = num(sale.amountCents);
    if (date && amountCents != null) lastSale = { date, amountCents };
  }
  const owners = Array.isArray(row.ownersOfRecord)
    ? row.ownersOfRecord.filter((n): n is string => typeof n === "string")
    : [];
  const parsed = parseBbl(bbl);
  let lastDeed: LastDeed | null = null;
  const lastDeedRaw = row.lastDeed;
  if (lastDeedRaw && typeof lastDeedRaw === "object" && !Array.isArray(lastDeedRaw)) {
    const deed = lastDeedRaw as Record<string, unknown>;
    const type = str(deed.type);
    const date = str(deed.date);
    if (type && date) lastDeed = { type, date };
  } else if (lastSale) {
    lastDeed = { type: "DEED", date: lastSale.date };
  }
  return {
    bbl,
    normalizedAddress: str(row.normalizedAddress) || fallback.label || fallback.address,
    lat: num(row.lat) ?? fallback.lat,
    lng: num(row.lng) ?? fallback.lng,
    borough: str(row.borough) || parsed?.boroughName || fallback.borough || "",
    block: str(row.block) || parsed?.block || "",
    lot: str(row.lot) || parsed?.lot || "",
    propertyType: str(row.propertyType) || null,
    ownersOfRecord: owners,
    lastSale,
    lastDeed,
    documentCount: num(row.documentCount) ?? 0,
    openViolations: num(row.openViolations),
  };
}

export async function lookupProperty(
  address: string,
  opts: { force?: boolean } = {},
): Promise<LookupPropertyResult> {
  const hits = await geosearchAddress(address, 1);
  const hit = hits[0];
  if (!hit?.bbl) return null;

  const admin = createServiceRoleClient();
  if (!opts.force) {
    const { data: cached } = await admin
      .from("properties")
      .select("acris_payload, acris_fetched_at, lat, lng")
      .eq("bbl", hit.bbl)
      .maybeSingle();
    if (cached?.acris_payload && cached.acris_fetched_at) {
      const record = recordFromPayload(cached.acris_payload, hit);
      if (record) return record;
    }
  }

  const record = await fetchAcrisRecord(hit);
  if (!record) return null;

  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("properties")
    .select("id, acris_payload")
    .eq("bbl", record.bbl)
    .maybeSingle();

  const extra =
    existing?.acris_payload &&
    typeof existing.acris_payload === "object" &&
    !Array.isArray(existing.acris_payload)
      ? (existing.acris_payload as Record<string, unknown>)
      : {};

  const payload = {
    ...extra,
    bbl: record.bbl,
    normalizedAddress: record.normalizedAddress,
    lat: record.lat,
    lng: record.lng,
    ownersOfRecord: record.ownersOfRecord,
    lastSale: record.lastSale,
    lastDeed: record.lastDeed,
    borough: record.borough,
    block: record.block,
    lot: record.lot,
    propertyType: record.propertyType,
    documentCount: record.documentCount,
    openViolations: record.openViolations,
  } satisfies Json;

  const parsed = parseBbl(record.bbl);
  const row = {
    bbl: record.bbl,
    address_line: hit.address,
    city: hit.city || "New York",
    state: hit.state || "NY",
    zip: hit.zip || null,
    borough: parsed?.boroughName ?? hit.borough,
    block: parsed?.block ?? null,
    lot: parsed?.lot ?? null,
    lat: record.lat,
    lng: record.lng,
    acris_payload: payload,
    acris_fetched_at: now,
  };
  if (existing) {
    await admin.from("properties").update(row).eq("id", existing.id);
  } else {
    const { error } = await admin.from("properties").insert(row);
    if (error) {
      await admin.from("properties").update(row).eq("bbl", record.bbl);
    }
  }

  return record;
}

function unitFromText(value: string): string | null {
  const match = value.match(/(?:#|unit\s+|apt\.?\s+|apartment\s+)([A-Za-z0-9-]+)/i);
  if (match) return match[1].toUpperCase();
  return null;
}

function normalizeUnit(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/^#\s*/, "").trim().toUpperCase() || null;
}

function hitFromBbl(address: string, bbl: string, seed?: GeoSearchHit): GeoSearchHit | null {
  const parsed = parseBbl(bbl);
  if (!parsed) return null;
  return {
    label: seed?.label || address,
    address: seed?.address || address,
    street: seed?.street || address,
    neighborhood: seed?.neighborhood || "",
    borough: seed?.borough || parsed.boroughName,
    city: seed?.city || "New York",
    state: seed?.state || "NY",
    zip: seed?.zip || "",
    lat: seed?.lat ?? 0,
    lng: seed?.lng ?? 0,
    bbl: parsed.bbl,
  };
}

function candidatesFromHits(hits: GeoSearchHit[]): PublicAcrisCandidate[] {
  const seen = new Set<string>();
  const out: PublicAcrisCandidate[] = [];
  for (const hit of hits) {
    if (!hit.bbl) continue;
    const parsed = parseBbl(hit.bbl);
    if (!parsed || seen.has(parsed.bbl)) continue;
    seen.add(parsed.bbl);
    out.push({
      bbl: parsed.bbl,
      address: hit.label || hit.address,
      unit: unitFromText(`${hit.address} ${hit.label}`),
      borough: parsed.boroughName,
      block: parsed.block,
      lot: parsed.lot,
      owners: [],
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** Lightweight owner lookup for the unit picker — avoids full deed/master fan-out. */
async function fetchOwnersForBbl(
  bbl: string,
  opts: SocrataOpts,
): Promise<string[]> {
  const parsed = parseBbl(bbl);
  if (!parsed) return [];
  const borough = String(parsed.boroughCode);
  const block = String(Number(parsed.block));
  const lot = String(Number(parsed.lot));
  const soft: SocrataOpts = { ...opts, throwOnError: false };
  const legals = await socrataQuery(
    SOCRATA_DATASETS.acrisLegals,
    {
      $select: "document_id",
      $where: `borough=${borough} and block=${block} and lot=${lot}`,
      $limit: "100",
    },
    soft,
  );
  const documentIds = [
    ...new Set(legals.map((row) => str(row.document_id)).filter(Boolean)),
  ].slice(0, 40);
  if (!documentIds.length) return [];
  const listed = documentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const masters = await socrataQuery(
    SOCRATA_DATASETS.acrisMaster,
    {
      $select: "document_id,doc_type,document_date,recorded_datetime",
      $where: `document_id in (${listed})`,
      $limit: "100",
    },
    soft,
  );
  let deedId: string | null = null;
  let bestDate = "";
  for (const row of masters) {
    if (!isDeedType(str(row.doc_type))) continue;
    const date = dateOnly(row.recorded_datetime) || dateOnly(row.document_date);
    if (!date) continue;
    if (!bestDate || date > bestDate) {
      bestDate = date;
      deedId = str(row.document_id) || null;
    }
  }
  if (!deedId) return [];
  const parties = await socrataQuery(
    SOCRATA_DATASETS.acrisParties,
    {
      $select: "name,party_type",
      $where: `document_id='${deedId.replace(/'/g, "''")}'`,
      $limit: "50",
    },
    soft,
  );
  const grantees = parties.filter((row) => {
    const t = str(row.party_type);
    return t === "2" || t.toUpperCase() === "GRANTEE";
  });
  const source = grantees.length ? grantees : parties;
  return uniqueNames(source.map((row) => str(row.name)).filter(Boolean));
}

async function enrichCandidatesWithOwners(
  candidates: PublicAcrisCandidate[],
  opts: FetchAcrisOpts,
): Promise<PublicAcrisCandidate[]> {
  const out = candidates.map((row) => ({ ...row }));
  if (!out.length) return out;

  // Soft deadline: never block the unit picker waiting forever on owner lookups.
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), 12_000);
  const onParentAbort = () => budget.abort();
  opts.signal?.addEventListener("abort", onParentAbort, { once: true });
  const soft: SocrataOpts = { signal: budget.signal, throwOnError: false };

  try {
    // Small picker sets (typical condo unit collision = 2) load in parallel.
    await Promise.all(
      out.map(async (row, idx) => {
        try {
          const owners = await fetchOwnersForBbl(row.bbl, soft);
          if (owners.length) out[idx] = { ...row, owners };
        } catch {
          /* keep candidate without owners */
        }
      }),
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
  return out;
}

function toPublicRecord(record: PropertyRecord, unit: string | null): PublicAcrisRecord {
  return {
    owners: record.ownersOfRecord,
    address: record.normalizedAddress,
    bbl: record.bbl,
    borough: record.borough,
    block: record.block,
    lot: record.lot,
    unit,
    propertyType: record.propertyType,
    lastDeed: record.lastDeed,
  };
}

function makeDiagnostics(partial: {
  input: string;
  borough: string | null;
  resolved: AcrisDiagnostics["resolved"];
  counts?: StageCounts;
  reason: AcrisLookupReason;
}): AcrisDiagnostics {
  return {
    input: partial.input,
    borough: partial.borough,
    resolved: partial.resolved,
    counts: partial.counts ?? { ...EMPTY_COUNTS },
    reason: partial.reason,
  };
}

function qualifyAddress(address: string, borough: string | null): string {
  const trimmed = address.trim();
  if (!borough) return trimmed;
  if (trimmed.toLowerCase().includes(borough.toLowerCase())) return trimmed;
  return `${trimmed}, ${borough}`;
}

type UnitLot = { lot: string; unit: string; bbl: string };

function bblFromParts(boroughCode: number, block: string, lot: string): string {
  const blockPad = block.replace(/\D/g, "").padStart(5, "0").slice(-5);
  const lotPad = lot.replace(/\D/g, "").padStart(4, "0").slice(-4);
  return `${boroughCode}${blockPad}${lotPad}`;
}

function unitKey(value: string): string {
  return value.replace(/[\s#-]/g, "").toUpperCase();
}

async function findUnitLotsByUnit(
  boroughCode: number,
  block: string,
  resolvedLot: string,
  unit: string,
  opts: SocrataOpts,
): Promise<UnitLot[]> {
  const blockNum = String(Number(block));
  const resolvedLotNum = Number(resolvedLot);
  const condoBillboard = Number.isFinite(resolvedLotNum) && resolvedLotNum >= 7500;
  const lotFilter = condoBillboard ? " and lot >= 1000 and lot < 7500" : "";
  const escaped = unit.replace(/'/g, "''").toUpperCase();
  // Prefer a plain select + local dedupe — Socrata $group is slower on this dataset.
  const rows = await socrataQuery(
    SOCRATA_DATASETS.acrisLegals,
    {
      $select: "lot,unit",
      $where: `borough=${boroughCode} and block=${blockNum} and upper(unit)='${escaped}'${lotFilter}`,
      $limit: "100",
    },
    opts,
  );
  const byLot = new Map<string, UnitLot>();
  const want = unitKey(unit);
  for (const row of rows) {
    const lotRaw = str(row.lot);
    const found = normalizeUnit(str(row.unit));
    if (!lotRaw || !found) continue;
    if (unitKey(found) !== want) continue;
    const lot = lotRaw.replace(/\D/g, "").padStart(4, "0").slice(-4);
    if (byLot.has(lot)) continue;
    byLot.set(lot, {
      lot,
      unit: found,
      bbl: bblFromParts(boroughCode, block, lotRaw),
    });
  }
  return [...byLot.values()].sort((a, b) => a.lot.localeCompare(b.lot));
}

async function findUnitLotsOnBlock(
  boroughCode: number,
  block: string,
  resolvedLot: string,
  opts: SocrataOpts,
): Promise<UnitLot[]> {
  const blockNum = String(Number(block));
  const resolvedLotNum = Number(resolvedLot);
  // Condo billboard lots (75xx+) — only pull unit lots (typically 1001+), not other parcels on the block.
  const condoBillboard = Number.isFinite(resolvedLotNum) && resolvedLotNum >= 7500;
  const lotFilter = condoBillboard ? " and lot >= 1000 and lot < 7500" : "";
  const rows = await socrataQuery(
    SOCRATA_DATASETS.acrisLegals,
    {
      $select: "lot,unit",
      $where: `borough=${boroughCode} and block=${blockNum} and unit is not null${lotFilter}`,
      $limit: "500",
    },
    opts,
  );
  const byLot = new Map<string, string>();
  for (const row of rows) {
    const lotRaw = str(row.lot);
    const unit = normalizeUnit(str(row.unit));
    if (!lotRaw || !unit) continue;
    const lotPad = lotRaw.replace(/\D/g, "").padStart(4, "0").slice(-4);
    if (!byLot.has(lotPad)) byLot.set(lotPad, unit);
  }
  const out: UnitLot[] = [];
  for (const [lot, unit] of [...byLot.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({
      lot,
      unit,
      bbl: bblFromParts(boroughCode, block, lot),
    });
  }
  return out;
}

function unitLotsToCandidates(
  lots: UnitLot[],
  address: string,
  boroughName: string,
  block: string,
): PublicAcrisCandidate[] {
  return lots.slice(0, 10).map((row) => ({
    bbl: row.bbl,
    address,
    unit: row.unit,
    borough: boroughName,
    block,
    lot: row.lot,
    owners: [],
  }));
}

const PUBLIC_FETCH: FetchAcrisOpts = {
  includeViolations: false,
  throwOnError: true,
};

async function resolveDeedOrCondo(
  hit: GeoSearchHit,
  input: string,
  borough: string | null,
  requestedUnit: string | null,
  candidateCount: number,
  fetchOpts: FetchAcrisOpts,
): Promise<PublicAcrisLookup> {
  const parsed = hit.bbl ? parseBbl(hit.bbl) : null;
  const resolvedBase = parsed
    ? {
        address: hit.label || hit.address,
        borough: parsed.boroughName,
        bbl: parsed.bbl,
        candidateCount,
      }
    : null;

  if (!parsed) {
    return {
      status: "none",
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: resolvedBase,
        reason: "bbl_not_found",
      }),
    };
  }

  const lotNum = Number(parsed.lot);
  const condoBillboard = Number.isFinite(lotNum) && lotNum >= 7500;
  // Condo billboard + known unit: skip the heavy building deed fan-out and resolve the unit lot directly.
  const detail =
    condoBillboard && requestedUnit
      ? { record: null, counts: { ...EMPTY_COUNTS }, hasDeed: false }
      : await fetchAcrisDetail(hit, fetchOpts);
  if (detail.hasDeed && detail.record) {
    return {
      status: "match",
      record: toPublicRecord(detail.record, requestedUnit),
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: resolvedBase,
        counts: detail.counts,
        reason: "matched",
      }),
    };
  }

  const queryOpts: SocrataOpts = {
    signal: fetchOpts.signal,
    throwOnError: fetchOpts.throwOnError,
  };
  if (requestedUnit) {
    const unitMatches = await findUnitLotsByUnit(
      parsed.boroughCode,
      parsed.block,
      parsed.lot,
      requestedUnit,
      queryOpts,
    );
    if (unitMatches.length > 1) {
      const candidates = await enrichCandidatesWithOwners(
        unitLotsToCandidates(
          unitMatches,
          hit.label || hit.address,
          parsed.boroughName,
          parsed.block,
        ),
        fetchOpts,
      );
      return {
        status: "multiple",
        candidates,
        diagnostics: makeDiagnostics({
          input,
          borough,
          resolved: {
            address: hit.label || hit.address,
            borough: parsed.boroughName,
            bbl: parsed.bbl,
            candidateCount: candidates.length,
          },
          counts: detail.counts,
          reason: "condo_units_available",
        }),
      };
    }
    const match = unitMatches[0];
    if (match) {
      const unitHit = hitFromBbl(hit.label || hit.address, match.bbl, hit);
      if (unitHit) {
        const unitDetail = await fetchAcrisDetail(unitHit, fetchOpts);
        if (unitDetail.hasDeed && unitDetail.record) {
          return {
            status: "match",
            record: toPublicRecord(unitDetail.record, match.unit),
            diagnostics: makeDiagnostics({
              input,
              borough,
              resolved: {
                address: unitDetail.record.normalizedAddress,
                borough: unitDetail.record.borough,
                bbl: unitDetail.record.bbl,
                candidateCount,
              },
              counts: unitDetail.counts,
              reason: "matched",
            }),
          };
        }
        return {
          status: "none",
          diagnostics: makeDiagnostics({
            input,
            borough,
            resolved: {
              address: hit.label || hit.address,
              borough: parsed.boroughName,
              bbl: match.bbl,
              candidateCount,
            },
            counts: unitDetail.counts,
            reason: "no_deed_for_lot",
          }),
        };
      }
    }
  }

  const unitLots = await findUnitLotsOnBlock(
    parsed.boroughCode,
    parsed.block,
    parsed.lot,
    queryOpts,
  );

  if (unitLots.length) {
    const filtered = requestedUnit
      ? unitLots.filter((row) => unitKey(row.unit) === unitKey(requestedUnit))
      : unitLots;
    const lots = filtered.length ? filtered : unitLots;
    if (lots.length === 1) {
      const only = lots[0];
      const unitHit = hitFromBbl(hit.label || hit.address, only.bbl, hit);
      if (unitHit) {
        const unitDetail = await fetchAcrisDetail(unitHit, fetchOpts);
        if (unitDetail.hasDeed && unitDetail.record) {
          return {
            status: "match",
            record: toPublicRecord(unitDetail.record, only.unit),
            diagnostics: makeDiagnostics({
              input,
              borough,
              resolved: {
                address: unitDetail.record.normalizedAddress,
                borough: unitDetail.record.borough,
                bbl: unitDetail.record.bbl,
                candidateCount: 1,
              },
              counts: unitDetail.counts,
              reason: "matched",
            }),
          };
        }
      }
    }
    const candidates = await enrichCandidatesWithOwners(
      unitLotsToCandidates(
        lots,
        hit.label || hit.address,
        parsed.boroughName,
        parsed.block,
      ),
      fetchOpts,
    );
    return {
      status: "multiple",
      candidates,
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: {
          address: hit.label || hit.address,
          borough: parsed.boroughName,
          bbl: parsed.bbl,
          candidateCount: candidates.length,
        },
        counts: detail.counts,
        reason: "condo_units_available",
      }),
    };
  }

  if (detail.counts.legals > 0 && !detail.hasDeed) {
    return {
      status: "none",
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: resolvedBase,
        counts: detail.counts,
        reason: "coop_no_deeds",
      }),
    };
  }

  return {
    status: "none",
    diagnostics: makeDiagnostics({
      input,
      borough,
      resolved: resolvedBase,
      counts: detail.counts,
      reason: "no_deed_for_lot",
    }),
  };
}

/**
 * Address → BBL → ACRIS public record. Does not read or write platform tables.
 */
export async function lookupPublicAcris(
  address: string,
  opts: {
    bbl?: string;
    borough?: string | null;
    unit?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<PublicAcrisLookup> {
  const trimmed = address.trim();
  const borough = opts.borough?.trim() || null;
  const requestedUnit =
    normalizeUnit(opts.unit) || unitFromText(trimmed);
  const input = trimmed;
  const fetchOpts: FetchAcrisOpts = { ...PUBLIC_FETCH, signal: opts.signal };

  if (!trimmed && !opts.bbl) {
    return {
      status: "none",
      diagnostics: makeDiagnostics({
        input: input || "",
        borough,
        resolved: null,
        reason: "address_unresolved",
      }),
    };
  }

  if (opts.bbl) {
    const hit = hitFromBbl(qualifyAddress(trimmed || opts.bbl, borough), opts.bbl);
    if (!hit) {
      return {
        status: "none",
        diagnostics: makeDiagnostics({
          input,
          borough,
          resolved: null,
          reason: "bbl_not_found",
        }),
      };
    }
    return resolveDeedOrCondo(hit, input, borough, requestedUnit, 1, fetchOpts);
  }

  const queryText = qualifyAddress(trimmed, borough);
  const rawHits = await geosearchAddress(queryText, 10, {
    signal: opts.signal,
    throwOnError: true,
  });
  const filtered = borough
    ? rawHits.filter((hit) => hit.borough.toLowerCase() === borough.toLowerCase())
    : rawHits;
  const hits = hitsForAddress(filtered.length ? filtered : [], queryText);
  // Without borough: if top house-number matches span boroughs, return chooser
  const exactHits = hitsForAddress(rawHits, queryText);
  if (!borough) {
    const byBorough = new Set(
      exactHits
        .map((hit) => hit.borough)
        .filter(Boolean)
        .map((name) => name.toLowerCase()),
    );
    if (byBorough.size > 1) {
      const candidates = await enrichCandidatesWithOwners(
        candidatesFromHits(exactHits).slice(0, 10),
        fetchOpts,
      );
      return {
        status: "multiple",
        candidates,
        diagnostics: makeDiagnostics({
          input,
          borough: null,
          resolved: candidates[0]
            ? {
                address: candidates[0].address,
                borough: candidates[0].borough,
                bbl: candidates[0].bbl,
                candidateCount: candidates.length,
              }
            : null,
          reason: "address_unresolved",
        }),
      };
    }
  }

  const poolHits = borough ? hits : exactHits;
  const candidates = candidatesFromHits(poolHits);
  if (!candidates.length) {
    return {
      status: "none",
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: null,
        reason: "address_unresolved",
      }),
    };
  }

  const unitMatches = requestedUnit
    ? candidates.filter(
        (row) => row.unit && row.unit.toUpperCase() === requestedUnit.toUpperCase(),
      )
    : [];
  const pool = unitMatches.length === 1 ? unitMatches : candidates;

  if (pool.length > 1) {
    const enriched = await enrichCandidatesWithOwners(pool.slice(0, 10), fetchOpts);
    return {
      status: "multiple",
      candidates: enriched,
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: {
          address: enriched[0].address,
          borough: enriched[0].borough,
          bbl: enriched[0].bbl,
          candidateCount: enriched.length,
        },
        reason: "address_unresolved",
      }),
    };
  }

  const chosen = pool[0];
  const seed = poolHits.find((hit) => hit.bbl && parseBbl(hit.bbl)?.bbl === chosen.bbl);
  const hit = hitFromBbl(queryText, chosen.bbl, seed);
  if (!hit) {
    return {
      status: "none",
      diagnostics: makeDiagnostics({
        input,
        borough,
        resolved: null,
        reason: "bbl_not_found",
      }),
    };
  }
  return resolveDeedOrCondo(
    hit,
    input,
    borough,
    requestedUnit,
    candidates.length,
    fetchOpts,
  );
}

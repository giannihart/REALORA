"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import type {
  AcrisDiagnostics,
  AcrisDiagnosticsPublic,
  AcrisLookupReason,
  PublicAcrisCandidate,
  PublicAcrisRecord,
} from "@/lib/services/acris-types";
import type { HomeType } from "@/lib/types";

export const HOME_TYPES: HomeType[] = ["Townhouse", "Condo", "Loft", "House"];

export type ManualPropertyFields = {
  type: HomeType | "";
  beds: string;
  baths: string;
  sqft: string;
  yearBuilt: string;
};

export const EMPTY_MANUAL: ManualPropertyFields = {
  type: "",
  beds: "",
  baths: "",
  sqft: "",
  yearBuilt: "",
};

export type ClientDiagnostics = AcrisDiagnostics | AcrisDiagnosticsPublic;

export type AcrisStepState =
  | { status: "loading" }
  | { status: "match"; record: PublicAcrisRecord; diagnostics: ClientDiagnostics }
  | {
      status: "none";
      diagnostics: ClientDiagnostics;
      submitted: string;
    }
  | { status: "unavailable"; diagnostics?: ClientDiagnostics }
  | {
      status: "multiple";
      candidates: PublicAcrisCandidate[];
      diagnostics: ClientDiagnostics;
    };

export function manualFieldsComplete(manual: ManualPropertyFields) {
  const beds = Number(manual.beds);
  const baths = Number(manual.baths);
  const sqft = Number(manual.sqft);
  const yearBuilt = Number(manual.yearBuilt);
  return (
    Boolean(manual.type) &&
    Number.isFinite(beds) &&
    beds >= 0 &&
    Number.isFinite(baths) &&
    baths >= 0 &&
    Number.isFinite(sqft) &&
    sqft > 0 &&
    Number.isFinite(yearBuilt) &&
    yearBuilt > 0
  );
}

function checkedLine(
  diagnostics: ClientDiagnostics | undefined,
  submitted?: string,
): string {
  const resolved = diagnostics?.resolved;
  if (resolved && "borough" in resolved && resolved.borough) {
    return `We checked: ${resolved.address}, ${resolved.borough} · BBL ${resolved.bbl}`;
  }
  if (resolved) {
    return `We checked: ${resolved.address} · BBL ${resolved.bbl}`;
  }
  if (submitted?.trim()) {
    return `We checked: ${submitted.trim()}`;
  }
  if (diagnostics && "input" in diagnostics && diagnostics.input) {
    return `We checked: ${diagnostics.input}`;
  }
  return "";
}

function reasonOf(diagnostics: ClientDiagnostics | undefined): AcrisLookupReason | null {
  return diagnostics?.reason ?? null;
}

export function AcrisSummaryStep({
  state,
  showManual,
  manual,
  onManualChange,
  onTryAgain,
  onPickCandidate,
  onEnterManual,
  onGoBack,
}: {
  state: AcrisStepState;
  showManual: boolean;
  manual: ManualPropertyFields;
  onManualChange: (patch: Partial<ManualPropertyFields>) => void;
  onTryAgain: () => void;
  onPickCandidate: (bbl: string) => void;
  onEnterManual: () => void;
  onGoBack: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Pulling your home&apos;s public record…</p>
        <div className="space-y-2">
          <div className="h-4 rounded-lg bg-warm" />
          <div className="h-4 w-4/5 rounded-lg bg-warm" />
          <div className="h-4 w-2/3 rounded-lg bg-warm" />
          <div className="h-24 rounded-2xl bg-warm" />
        </div>
      </div>
    );
  }

  if (state.status === "match") {
    const record = state.record;
    const owners = record.owners.filter(Boolean);
    const deed = record.lastDeed;
    const checked = checkedLine(state.diagnostics);
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">We found your home&apos;s public record.</p>
        {checked ? <p className="text-muted">{checked}</p> : null}
        <div className="space-y-2 rounded-2xl border border-line bg-warm/40 p-4">
          {owners.length ? (
            <p>
              <span className="text-muted">Recorded owner(s)</span>
              <span className="mt-0.5 block font-medium">{owners.join(", ")}</span>
            </p>
          ) : null}
          <p>
            <span className="text-muted">Address + BBL</span>
            <span className="mt-0.5 block font-medium">
              {record.address}
              {record.unit ? ` #${record.unit.toUpperCase()}` : ""}
            </span>
            <span className="mt-0.5 block">
              BBL {record.bbl}
              {record.borough
                ? ` · ${record.borough} · Block ${record.block} · Lot ${record.lot}`
                : ""}
            </span>
          </p>
          {record.propertyType ? (
            <p>
              <span className="text-muted">Property type</span>
              <span className="mt-0.5 block font-medium">{record.propertyType}</span>
            </p>
          ) : null}
          {deed ? (
            <p>
              <span className="text-muted">Most recent deed</span>
              <span className="mt-0.5 block font-medium">
                {deed.type} recorded {deed.date}
              </span>
            </p>
          ) : null}
        </div>
        <p className="text-muted">
          This is the city&apos;s record of your home — when you list, it&apos;s also how we
          verify ownership.
        </p>
        {showManual ? (
          <ManualPropertyForm manual={manual} onChange={onManualChange} />
        ) : (
          <button
            type="button"
            className="text-left text-sm text-muted underline underline-offset-2"
            onClick={onEnterManual}
          >
            Something&apos;s off? — enter details manually
          </button>
        )}
      </div>
    );
  }

  if (state.status === "multiple") {
    const condo = reasonOf(state.diagnostics) === "condo_units_available";
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">
          {condo ? "Which unit is yours?" : "Which unit/lot is yours?"}
        </p>
        <ul className="overflow-hidden rounded-2xl border border-line">
          {state.candidates.map((row) => {
            const owners = (row.owners ?? []).filter(Boolean);
            return (
              <li key={row.bbl} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-warm"
                  onClick={() => onPickCandidate(row.bbl)}
                >
                  <span className="block font-medium">
                    {row.unit ? `Unit ${row.unit.toUpperCase()}` : `Lot ${Number(row.lot)}`}
                  </span>
                  {owners.length ? (
                    <span className="mt-0.5 block">
                      <span className="text-muted">
                        Recorded owner{owners.length > 1 ? "s" : ""}:
                      </span>{" "}
                      <span className="font-medium">{owners.join(", ")}</span>
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-muted">
                    {row.address}
                    {row.borough
                      ? ` · ${row.borough} · Block ${Number(row.block)} · Lot ${Number(row.lot)}`
                      : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {showManual ? (
          <ManualPropertyForm manual={manual} onChange={onManualChange} />
        ) : (
          <button
            type="button"
            className="text-left text-sm text-muted underline underline-offset-2"
            onClick={onEnterManual}
          >
            Something&apos;s off? — enter details manually
          </button>
        )}
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">Public records aren&apos;t responding right now.</p>
        <button
          type="button"
          className="text-left text-sm font-medium text-forest underline underline-offset-2"
          onClick={onTryAgain}
        >
          Try again
        </button>
        {showManual ? (
          <ManualPropertyForm manual={manual} onChange={onManualChange} />
        ) : null}
      </div>
    );
  }

  const checked = checkedLine(state.diagnostics, state.submitted);
  const coop = reasonOf(state.diagnostics) === "coop_no_deeds";

  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">We couldn&apos;t match that address — no problem.</p>
      {checked ? <p className="text-muted">{checked}</p> : null}
      <p className="text-muted">
        {coop
          ? "This looks like a co-op building — co-ops are held as shares rather than deeds, so ACRIS has no deed for individual units. Manual entry is the normal path here."
          : "Some homes don’t appear in ACRIS — co-ops are held as shares rather than deeds, and new or recently recorded sales can lag."}
      </p>
      <button
        type="button"
        className="text-left text-sm text-muted underline underline-offset-2"
        onClick={onGoBack}
      >
        Wrong address? Go back and check it
      </button>
      <ManualPropertyForm manual={manual} onChange={onManualChange} />
    </div>
  );
}

function ManualPropertyForm({
  manual,
  onChange,
}: {
  manual: ManualPropertyFields;
  onChange: (patch: Partial<ManualPropertyFields>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MenuSelect
        className="sm:col-span-2"
        label="Property type"
        value={manual.type}
        placeholder="Select"
        options={HOME_TYPES.map((type) => ({ value: type, label: type }))}
        onChange={(value) => onChange({ type: value as HomeType })}
      />
      <label className="block text-sm">
        Beds
        <input
          value={manual.beds}
          inputMode="decimal"
          onChange={(e) => onChange({ beds: e.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Baths
        <input
          value={manual.baths}
          inputMode="decimal"
          onChange={(e) => onChange({ baths: e.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Sq ft
        <input
          value={manual.sqft}
          inputMode="numeric"
          onChange={(e) => onChange({ sqft: e.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Year built
        <input
          value={manual.yearBuilt}
          inputMode="numeric"
          onChange={(e) => onChange({ yearBuilt: e.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2"
        />
      </label>
    </div>
  );
}

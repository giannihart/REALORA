"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { cn, formatPrice } from "@/lib/format";
import { Progress } from "@/components/ui/Progress";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { createListingAction, updateListingAction } from "@/lib/actions/listing";
import {
  AcrisSummaryStep,
  EMPTY_MANUAL,
  manualFieldsComplete,
  type AcrisStepState,
  type ManualPropertyFields,
} from "@/components/sell/AcrisSummaryStep";
import {
  executeNativeSignatureAction,
  getSignatureEvidenceUrlAction,
  getSigningConfigAction,
  regenerateListingAgreementAction,
  startListingAgreementAction,
} from "@/lib/actions/documents";
import { reportIntakeAgreementHoldAction } from "@/lib/actions/intake-hold";
import {
  ListingAgreementView,
  type SignatureBoxState,
} from "@/components/sell/ListingAgreementView";
import { SignatureCapture } from "@/components/esign/SignatureCapture";
import { ScheduleCalendar } from "@/components/sell/ScheduleCalendar";
import { NetSheetCalculator } from "@/components/sell/NetSheetCalculator";
import { FAQ, FAQ_ASK_PLACEHOLDER, FOOT_PRINT } from "@/components/sell/copy";
import { FaqSection } from "@/components/shared/FaqSection";
import { formatSignedStamp, readEsignMeta } from "@/lib/documents/esign-meta";
import {
  clearSellIntakeHandoff,
  loadSellIntakeHandoff,
  markIntakeJustSigned,
  saveSellIntakeHandoff,
  sellAuthNext,
} from "@/lib/sell/intake-handoff";
import {
  blockLotFromBbl,
  brokerageIdentityIsRenderable,
  exclusiveExpiresOn,
  listingAgreementTemplate,
} from "@/lib/templates/listing-agreement";
import { toast } from "sonner";
import type { ClientDiagnostics } from "@/components/sell/AcrisSummaryStep";
import type { PropertyRecord, PublicAcrisLookup, PublicAcrisRecord } from "@/lib/services/acris-types";
import type { PlaceSuggestion } from "@/lib/google-maps/places";
import type { GeoSearchHit } from "@/lib/nyc/geosearch";

const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;

const steps = ["Address", "ACRIS summary", "Listing agreement", "Schedule media"] as const;
const AGREEMENT_STEP = 2;
const MEDIA_STEP = 3;

function defaultMediaDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SellOnboardingView() {
  const router = useRouter();
  const params = useSearchParams();
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const setRole = useAppData((s) => s.setRole);
  const signedIn = useAppData((s) => s.user.signedIn);
  const hydrated = useAppData((s) => s.hydrated);
  const userId = useAppData((s) => s.user.id);
  const listings = useAppData((s) => s.listings);
  const documents = useAppData((s) => s.documents ?? []);
  const sellerName = useAppData((s) => s.user.name || s.user.email || "Seller");
  const [step, setStep] = useState(0);
  const [street, setStreet] = useState(params.get("address") ?? "");
  const [unit, setUnit] = useState((params.get("unit") ?? "").toUpperCase());
  const [neighborhood, setNeighborhood] = useState(params.get("neighborhood") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [borough, setBorough] = useState(params.get("borough") ?? "");
  const [acris, setAcris] = useState<AcrisStepState>({ status: "loading" });
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<ManualPropertyFields>(EMPTY_MANUAL);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState("");
  const [streetSuggestions, setStreetSuggestions] = useState<GeoSearchHit[]>([]);
  const [neighborhoodSuggestions, setNeighborhoodSuggestions] = useState<PlaceSuggestion[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [agreementDocId, setAgreementDocId] = useState<string | null>(null);
  const [brokerageName, setBrokerageName] = useState("REALORA");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [brokerOfRecordName, setBrokerOfRecordName] = useState("");
  const [brokerOfRecordLicense, setBrokerOfRecordLicense] = useState("");
  const [listingTermDays, setListingTermDays] = useState(180);
  const [protectionDays, setProtectionDays] = useState(90);
  const [askingPrice, setAskingPrice] = useState<number | null>(() => {
    const raw = params.get("price");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [plusOne, setPlusOne] = useState(params.get("plusOne") === "1");
  const [handoffRestored, setHandoffRestored] = useState(false);
  const [signingBusy, setSigningBusy] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [sellerSignedAt, setSellerSignedAt] = useState<string | null>(null);
  const [sellerSignatureUrl, setSellerSignatureUrl] = useState<string | null>(null);
  const [holdReported, setHoldReported] = useState<string | null>(null);
  const [mediaDate, setMediaDate] = useState(defaultMediaDate);
  const [mediaTime, setMediaTime] = useState<string | null>(null);
  const [sheetPrice, setSheetPrice] = useState(4_190_000);
  const streetDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neighborhoodDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streetSearchId = useRef(0);
  const neighborhoodSearchId = useRef(0);
  const acrisAbort = useRef<AbortController | null>(null);
  const cobrokeSync = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** In-flight prep so Tap to sign can open the canvas before listing/PDF finish. */
  const signingPrepRef = useRef<Promise<string | null> | null>(null);
  const agreementDocIdRef = useRef<string | null>(null);
  const listingIdRef = useRef<string | null>(null);
  const [captureError, setCaptureError] = useState("");
  const awaitingSession =
    isSupabaseDataMode() && params.get("resume") === "1" && !hydrated;

  useEffect(() => {
    if (!isSupabaseDataMode()) return;
    void getSigningConfigAction().then((r) => {
      if (r.ok) {
        setBrokerageName(r.data.brokerageName);
        setLicenseNumber(r.data.licenseNumber);
        setBrokerOfRecordName(r.data.brokerOfRecordName);
        setBrokerOfRecordLicense(r.data.brokerOfRecordLicense);
        setListingTermDays(r.data.listingTermDays);
        setProtectionDays(r.data.protectionDays);
      }
    });
  }, []);

  /** After a refresh: restore signed + land on media if agreement is done but media isn't. */
  useEffect(() => {
    if (!hydrated || !signedIn || !userId) return;
    const signedAgreement = documents.find((d) => {
      if (!/listing agreement/i.test(d.name)) return false;
      const status = (d.status ?? d.signStatus ?? "").toLowerCase();
      return (
        status === "signed" ||
        status === "fully executed" ||
        status === "fully_executed" ||
        status === "completed"
      );
    });
    if (!signedAgreement) return;
    setSigned(true);
    const meta = readEsignMeta(signedAgreement.extracted as never);
    if (meta?.sellerSignedAt) setSellerSignedAt(meta.sellerSignedAt);
    if (signedAgreement.id) {
      agreementDocIdRef.current = signedAgreement.id;
      setAgreementDocId(signedAgreement.id);
    }
    const active = listings.find((l) => {
      if (l.sellerId !== userId) return false;
      const s = (l.status ?? "").toLowerCase();
      return s !== "closed" && s !== "withdrawn";
    });
    if (active && !listingId) rememberListingId(active.id);
    const mediaDone = (active?.stagingLabels ?? []).some((l) =>
      /media scheduled/i.test(l),
    );
    if (mediaDone) {
      if (step === AGREEMENT_STEP || step === MEDIA_STEP) return;
      router.replace(
        `/portal/seller/listing?listing=${encodeURIComponent(active!.id)}`,
      );
      return;
    }
    // Stay on agreement until Continue; only jump to media on a cold resume.
    if (step !== AGREEMENT_STEP && step !== MEDIA_STEP) setStep(MEDIA_STEP);
  }, [hydrated, signedIn, userId, listings, documents, listingId, step, router]);

  /** Load drawn signature into the agreement box (data URL — survives refresh). */
  useEffect(() => {
    if (!signed) return;
    if (sellerSignatureUrl?.startsWith("data:image/")) return;
    const documentId =
      agreementDocIdRef.current ||
      documents.find((d) => /listing agreement/i.test(d.name))?.id ||
      null;
    if (!documentId) return;
    let cancelled = false;
    void getSignatureEvidenceUrlAction(documentId, "seller").then((evidence) => {
      if (cancelled || !evidence.ok) return;
      setSellerSignatureUrl(evidence.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [signed, sellerSignatureUrl, documents]);

  /** Poll while identity is blocked so readiness resumes the step. */
  useEffect(() => {
    if (!isSupabaseDataMode() || step !== AGREEMENT_STEP || signed) return;
    if (
      brokerageIdentityIsRenderable(
        brokerageName,
        licenseNumber,
        brokerOfRecordName,
        brokerOfRecordLicense,
      )
    ) {
      return;
    }
    const id = window.setInterval(() => {
      void getSigningConfigAction().then((r) => {
        if (!r.ok) return;
        const nextReady = brokerageIdentityIsRenderable(
          r.data.brokerageName,
          r.data.licenseNumber,
          r.data.brokerOfRecordName,
          r.data.brokerOfRecordLicense,
        );
        const wasBlocked = !brokerageIdentityIsRenderable(
          brokerageName,
          licenseNumber,
          brokerOfRecordName,
          brokerOfRecordLicense,
        );
        setBrokerageName(r.data.brokerageName);
        setLicenseNumber(r.data.licenseNumber);
        setBrokerOfRecordName(r.data.brokerOfRecordName);
        setBrokerOfRecordLicense(r.data.brokerOfRecordLicense);
        setListingTermDays(r.data.listingTermDays);
        setProtectionDays(r.data.protectionDays);
        if (wasBlocked && nextReady) {
          toast("Your agreement is ready to sign.");
        }
      });
    }, 12_000);
    return () => window.clearInterval(id);
  }, [
    step,
    signed,
    brokerageName,
    licenseNumber,
    brokerOfRecordName,
    brokerOfRecordLicense,
  ]);

  useEffect(() => {
    if (handoffRestored) return;
    if (params.get("resume") !== "1") {
      setHandoffRestored(true);
      return;
    }
    const handoff = loadSellIntakeHandoff();
    if (!handoff) {
      setHandoffRestored(true);
      return;
    }
    setStreet(handoff.street);
    setUnit(handoff.unit.toUpperCase());
    setNeighborhood(handoff.neighborhood);
    setCity(handoff.city);
    setBorough(handoff.borough);
    setAcris(handoff.acris);
    setShowManual(handoff.showManual);
    setManual(handoff.manual);
    if (handoff.price != null) setAskingPrice(handoff.price);
    setPlusOne(handoff.plusOne);
    if (handoff.mediaDate) setMediaDate(handoff.mediaDate);
    if (handoff.mediaTime) setMediaTime(handoff.mediaTime);
    setStep(Math.min(MEDIA_STEP, Math.max(0, handoff.step)));
    setHandoffRestored(true);
  }, [params, handoffRestored]);

  useEffect(() => {
    return () => {
      if (streetDebounce.current) clearTimeout(streetDebounce.current);
      if (neighborhoodDebounce.current) clearTimeout(neighborhoodDebounce.current);
      if (cobrokeSync.current) clearTimeout(cobrokeSync.current);
      acrisAbort.current?.abort();
    };
  }, []);

  const agreementDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  /** Intake price → listing only. Never recited in the agreement. */
  const intakePrice =
    askingPrice != null && Number.isFinite(askingPrice) && askingPrice > 0
      ? askingPrice
      : null;
  const agreementBbl = acris.status === "match" ? acris.record.bbl : null;
  const agreementBlockLot = useMemo(() => {
    if (acris.status === "match") {
      return {
        block: acris.record.block || blockLotFromBbl(acris.record.bbl).block,
        lot: acris.record.lot || blockLotFromBbl(acris.record.bbl).lot,
      };
    }
    return blockLotFromBbl(agreementBbl);
  }, [acris, agreementBbl]);
  const agreementAddress = useMemo(() => {
    const line = withUnit(street, unit) || "Address pending";
    return [line, neighborhood, borough || city, "NY"]
      .filter((part) => part && String(part).trim())
      .join(", ");
  }, [street, unit, neighborhood, borough, city]);
  const identityReady = brokerageIdentityIsRenderable(
    brokerageName,
    licenseNumber,
    brokerOfRecordName,
    brokerOfRecordLicense,
  );
  /** Identity missing: document cannot render. Native signing needs no vendor keys. */
  const identityHold = step === AGREEMENT_STEP && !signed && !identityReady;
  const holdReason: "identity" | null = identityHold ? "identity" : null;

  useEffect(() => {
    if (!holdReason) return;
    const key = `${holdReason}:${agreementAddress}`;
    if (holdReported === key) return;
    setHoldReported(key);
    stashHandoff(AGREEMENT_STEP);
    void reportIntakeAgreementHoldAction({
      reason: holdReason,
      address: agreementAddress,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stash uses current form state
  }, [holdReason, agreementAddress, holdReported]);

  const agreementDoc = useMemo(() => {
    if (!identityReady) return null;
    try {
      return listingAgreementTemplate({
        sellerName: signedIn ? sellerName || "Seller" : "Seller (name from your account)",
        brokerageName,
        licenseNumber,
        brokerOfRecordName,
        brokerOfRecordLicense,
        address: agreementAddress,
        bbl: agreementBbl,
        block: agreementBlockLot.block,
        lot: agreementBlockLot.lot,
        date: agreementDate,
        exclusiveExpiresOn: exclusiveExpiresOn(agreementDate, listingTermDays),
        protectionDays,
        buyerAgentOffered: plusOne,
      });
    } catch {
      return null;
    }
  }, [
    identityReady,
    signedIn,
    sellerName,
    brokerageName,
    licenseNumber,
    brokerOfRecordName,
    brokerOfRecordLicense,
    agreementAddress,
    agreementBbl,
    agreementBlockLot.block,
    agreementBlockLot.lot,
    agreementDate,
    listingTermDays,
    protectionDays,
    plusOne,
  ]);

  function stashHandoff(atStep = AGREEMENT_STEP) {
    saveSellIntakeHandoff({
      v: 1,
      street,
      unit,
      neighborhood,
      city,
      borough,
      acris,
      showManual,
      manual,
      mediaDate,
      mediaTime,
      price: askingPrice,
      plusOne,
      step: atStep,
    });
  }

  function goToAuth(authMode: "signup" | "signin", atStep = AGREEMENT_STEP) {
    stashHandoff(atStep);
    const next = sellAuthNext({ price: askingPrice, plusOne });
    const q = new URLSearchParams({
      intent: "selling",
      next,
      mode: authMode,
    });
    router.push(`/auth?${q.toString()}`);
  }

  function searchStreet(q: string) {
    if (streetDebounce.current) clearTimeout(streetDebounce.current);
    const next = q.trim();
    if (next.length < 2) {
      streetSearchId.current += 1;
      setStreetSuggestions([]);
      return;
    }
    const searchId = ++streetSearchId.current;
    streetDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geosearch?text=${encodeURIComponent(next)}&autocomplete=1`,
        );
        if (!res.ok || searchId !== streetSearchId.current) return;
        const data = (await res.json()) as GeoSearchHit[] | { hits?: GeoSearchHit[] };
        const hits = Array.isArray(data) ? data : (data.hits ?? []);
        setStreetSuggestions(hits);
      } catch {
        if (searchId === streetSearchId.current) setStreetSuggestions([]);
      }
    }, 120);
  }

  function searchNeighborhood(q: string) {
    if (neighborhoodDebounce.current) clearTimeout(neighborhoodDebounce.current);
    const next = q.trim();
    if (next.length < 2) {
      neighborhoodSearchId.current += 1;
      setNeighborhoodSuggestions([]);
      return;
    }
    const searchId = ++neighborhoodSearchId.current;
    neighborhoodDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/public/places-autocomplete?q=${encodeURIComponent(next)}`,
        );
        if (!res.ok || searchId !== neighborhoodSearchId.current) return;
        const data = (await res.json()) as { suggestions?: PlaceSuggestion[] };
        setNeighborhoodSuggestions(data.suggestions ?? []);
      } catch {
        if (searchId === neighborhoodSearchId.current) setNeighborhoodSuggestions([]);
      }
    }, 220);
  }

  function pickStreet(hit: GeoSearchHit) {
    setStreet(hit.label.split(",")[0]?.trim() || hit.address || hit.label);
    const boroughName = hit.borough ? asBorough(hit.borough) || hit.borough : "";
    if (boroughName) setBorough(boroughName);
    setNeighborhood(hit.neighborhood.trim() || boroughName);
    setCity(hit.city.trim() || "New York");
    setNeighborhoodSuggestions([]);
    setStreetSuggestions([]);
  }

  function pickNeighborhood(place: PlaceSuggestion) {
    setNeighborhood(place.label);
    setNeighborhoodSuggestions([]);
  }

  async function onAgreementSigned(
    documentId: string,
    at: string,
    previewDataUrl?: string,
  ) {
    setSellerSignedAt(at);
    setSigned(true);
    setCaptureOpen(false);
    setError("");
    // Prefer the just-drawn PNG so the box shows ink immediately.
    if (previewDataUrl) setSellerSignatureUrl(previewDataUrl);
    if (listingId) markIntakeJustSigned(listingId);
    stashHandoff(AGREEMENT_STEP);
    if (!previewDataUrl) {
      const evidence = await getSignatureEvidenceUrlAction(documentId, "seller");
      if (evidence.ok) setSellerSignatureUrl(evidence.data.url);
    }
  }

  function rememberListingId(id: string) {
    listingIdRef.current = id;
    setListingId(id);
  }

  /** Draft listing exists for the e-sign/vault pipeline; portal admits only after Signed. */
  async function ensureListingDraft(): Promise<string | null> {
    if (!isSupabaseDataMode()) {
      setCaptureError("Signing is unavailable in this environment.");
      setError("Signing is unavailable in this environment.");
      return null;
    }
    if (!signedIn) {
      goToAuth("signup", AGREEMENT_STEP);
      return null;
    }
    setRole("seller");
    const existingId =
      listingIdRef.current ||
      listingId ||
      listings.find((l) => {
        if (userId && l.sellerId !== userId) return false;
        const s = (l.status ?? "").toLowerCase();
        return s !== "closed" && s !== "withdrawn";
      })?.id ||
      null;
    if (existingId) {
      rememberListingId(existingId);
      if (intakePrice != null) {
        const updated = await updateListingAction(existingId, {
          price: intakePrice,
          buyerAgentOffered: plusOne,
        });
        if (!updated.ok) {
          setCaptureError(updated.message);
          setError(updated.message);
          return null;
        }
        applySnapshot(updated.data);
      }
      return existingId;
    }
    const matched = acris.status === "match" ? acris.record : null;
    const created = await createListingAction({
      address: withUnit(street, unit),
      neighborhood,
      city,
      state: "NY",
      zip: matched?.address.match(/\b(\d{5})\b/)?.[1] ?? "11215",
      borough: borough || matched?.borough,
      price: intakePrice ?? 0,
      buyerAgentOffered: plusOne,
      record: matched ? publicToRecord(matched) : null,
      lat: null,
      lng: null,
      type: manual.type || "Townhouse",
      beds: manual.beds ? Number(manual.beds) : 4,
      baths: manual.baths ? Number(manual.baths) : 3,
      sqft: manual.sqft ? Number(manual.sqft) : 3200,
      yearBuilt: manual.yearBuilt ? Number(manual.yearBuilt) : undefined,
    });
    if (!created.ok) {
      setCaptureError(created.message);
      setError(created.message);
      if (created.code === "unauthenticated") goToAuth("signin", AGREEMENT_STEP);
      return null;
    }
    applySnapshot(created.data);
    rememberListingId(created.data.listingId);
    return created.data.listingId;
  }

  async function syncCobroke(nextPlusOne: boolean) {
    setPlusOne(nextPlusOne);
    setSigned(false);
    if (!listingId || !isSupabaseDataMode()) return;
    if (cobrokeSync.current) clearTimeout(cobrokeSync.current);
    cobrokeSync.current = setTimeout(() => {
      void (async () => {
        const updated = await updateListingAction(listingId, {
          buyerAgentOffered: nextPlusOne,
        });
        if (!updated.ok) {
          setError(updated.message);
          return;
        }
        applySnapshot(updated.data);
        const regen = await regenerateListingAgreementAction(listingId);
        if (!regen.ok) {
          setError(regen.message);
          return;
        }
        applySnapshot(regen.data);
        agreementDocIdRef.current = regen.data.documentId;
        setAgreementDocId(regen.data.documentId);
      })();
    }, 250);
  }

  async function prepareAgreementForSigning(): Promise<string | null> {
    if (agreementDocIdRef.current) return agreementDocIdRef.current;
    if (signingPrepRef.current) return signingPrepRef.current;
    const prep = (async () => {
      const id = await ensureListingDraft();
      if (!id) return null;
      const started = await startListingAgreementAction(id);
      if (!started.ok) {
        setCaptureError(started.message);
        setError(started.message);
        return null;
      }
      agreementDocIdRef.current = started.data.documentId;
      setAgreementDocId(started.data.documentId);
      setCaptureError("");
      return started.data.documentId;
    })();
    signingPrepRef.current = prep;
    try {
      return await prep;
    } finally {
      if (signingPrepRef.current === prep) signingPrepRef.current = null;
    }
  }

  function beginSigning() {
    setError("");
    setCaptureError("");
    if (!identityReady) {
      setError("Your agreement is being prepared.");
      return;
    }
    if (!signedIn) {
      goToAuth("signup", AGREEMENT_STEP);
      return;
    }
    // Open the draw canvas immediately — listing/PDF prep runs in parallel.
    setCaptureOpen(true);
    void prepareAgreementForSigning();
  }

  /** Warm listing + agreement while the seller reads the document. */
  useEffect(() => {
    if (step !== AGREEMENT_STEP || !signedIn || !identityReady || signed) return;
    if (!isSupabaseDataMode()) return;
    void prepareAgreementForSigning();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch once per ready agreement step
  }, [step, signedIn, identityReady, signed]);

  async function submitSellerSignature(result: {
    pngDataUrl: string;
    method: "draw";
  }) {
    setSigningBusy(true);
    try {
      const documentId =
        agreementDocIdRef.current ?? (await prepareAgreementForSigning());
      if (!documentId) {
        setCaptureError((prev) => prev || "Document is not ready. Try again in a moment.");
        return;
      }
      setCaptureError("");
      const executed = await executeNativeSignatureAction({
        documentId,
        roleKey: "seller",
        method: result.method,
        pngDataUrl: result.pngDataUrl,
      });
      if (!executed.ok) {
        setCaptureError(executed.message);
        setError(executed.message);
        return;
      }
      applySnapshot(executed.data);
      await onAgreementSigned(
        executed.data.documentId,
        new Date().toISOString(),
        result.pngDataUrl,
      );
    } finally {
      setSigningBusy(false);
    }
  }

  function composeLookupAddress() {
    return [withUnit(street, unit), neighborhood, city]
      .filter((part) => part.trim())
      .join(", ");
  }

  function asDiagnostics(value: unknown): ClientDiagnostics | undefined {
    if (!value || typeof value !== "object") return undefined;
    return value as ClientDiagnostics;
  }

  async function runAcrisLookup(bbl?: string) {
    acrisAbort.current?.abort();
    const controller = new AbortController();
    acrisAbort.current = controller;
    setAcris({ status: "loading" });
    setShowManual(false);
    const submitted = composeLookupAddress();
    // Must exceed server LOOKUP_MS (25s) so the API can finish condo unit lookups.
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    const unitFromStreet = unit.trim() || submitted.match(/(?:#|unit\s+|apt\.?\s+)([A-Za-z0-9-]+)/i)?.[1] || null;
    try {
      const res = await fetch("/api/public/acris-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: submitted,
          borough: borough || null,
          unit: unitFromStreet,
          bbl,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        setAcris({ status: "unavailable" });
        return;
      }
      if (res.status === 429 || res.status >= 500) {
        const failed = await res.json().catch(() => null);
        setAcris({
          status: "unavailable",
          diagnostics: asDiagnostics(
            failed && typeof failed === "object"
              ? (failed as { diagnostics?: unknown }).diagnostics
              : undefined,
          ),
        });
        return;
      }
      const data = (await res.json()) as PublicAcrisLookup | { status?: string; diagnostics?: unknown };
      if (controller.signal.aborted) {
        setAcris({ status: "unavailable" });
        return;
      }
      const diagnostics = asDiagnostics(
        "diagnostics" in data ? data.diagnostics : undefined,
      );
      if (data.status === "match" && "record" in data && data.record && diagnostics) {
        setAcris({ status: "match", record: data.record, diagnostics });
        return;
      }
      if (
        data.status === "multiple" &&
        "candidates" in data &&
        data.candidates &&
        diagnostics
      ) {
        setAcris({
          status: "multiple",
          candidates: data.candidates,
          diagnostics,
        });
        return;
      }
      if (data.status === "none" && diagnostics) {
        setAcris({ status: "none", diagnostics, submitted });
        return;
      }
      setAcris({ status: "unavailable", diagnostics });
    } catch {
      setAcris({ status: "unavailable" });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function next() {
    if (step === 0 && (!street || !neighborhood)) {
      setError("Enter a street address and neighborhood.");
      return;
    }
    setError("");
    if (step === 0) {
      setStep(1);
      void runAcrisLookup();
      return;
    }
    if (step === 1) {
      if (acris.status === "loading") return;
      if (acris.status === "multiple" && !showManual) return;
      if (acris.status === "unavailable" && !showManual) {
        setShowManual(true);
        return;
      }
      if (acris.status === "match" && !showManual) {
        stashHandoff(AGREEMENT_STEP);
        setStep(AGREEMENT_STEP);
        return;
      }
      if (!manualFieldsComplete(manual)) {
        setError("Enter property type, beds, baths, sq ft, and year built.");
        return;
      }
      stashHandoff(AGREEMENT_STEP);
      setStep(AGREEMENT_STEP);
      return;
    }
    if (step === AGREEMENT_STEP && signed) {
      stashHandoff(MEDIA_STEP);
      setStep(MEDIA_STEP);
      return;
    }
    if (step === MEDIA_STEP) {
      if (!mediaTime) {
        setError("Confirm a media time to continue.");
        return;
      }
      if (listingId && isSupabaseDataMode()) {
        const when = mediaTime ? `${mediaDate}T${mediaTime}` : mediaDate;
        const updated = await updateListingAction(listingId, {
          mediaDate: when.slice(0, 10),
        });
        if (!updated.ok) {
          setError(updated.message);
          return;
        }
        applySnapshot(updated.data);
      }
      clearSellIntakeHandoff();
      if (listingId) {
        router.push(`/portal/seller/listing?listing=${encodeURIComponent(listingId)}`);
      }
    }
  }

  function continueDisabled() {
    if (signingBusy) return true;
    if (step === AGREEMENT_STEP) {
      if (!signed) return true;
      return !listingId;
    }
    if (step === MEDIA_STEP) return !mediaTime;
    if (step !== 1) return false;
    if (acris.status === "loading") return true;
    if (acris.status === "multiple" && !showManual) return true;
    if (acris.status === "unavailable" && !showManual) return false;
    if (acris.status === "match" && !showManual) return false;
    return !manualFieldsComplete(manual);
  }

  function continueLabel() {
    if (step === AGREEMENT_STEP && signed) return "Continue";
    if (step === MEDIA_STEP) return "Schedule media";
    if (step === 1 && acris.status === "match" && !showManual) return "This is my home";
    if (step === 1 && acris.status === "unavailable" && !showManual) {
      return "Continue with manual entry";
    }
    return "Continue";
  }

  const showContinue =
    (step !== AGREEMENT_STEP || signed) &&
    !(step === 1 && acris.status === "loading");

  return (
    <div className="min-h-[calc(100svh-3.5rem)]">
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-3xl font-medium tracking-tight">
              Sell with Realora
            </h1>
            {isSupabaseDataMode() ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Start your listing, we&apos;ll check your home&apos;s public record as you go.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                We check NYC public records for your address. Nothing you enter is saved.
              </p>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sell-sign-icon.png"
            alt=""
            className="relative -top-2 h-24 w-24 shrink-0 object-contain sm:-top-3 sm:h-32 sm:w-32"
          />
        </div>
        <div className="mt-3">
          <Progress value={((step + 1) / steps.length) * 100} />
          <p className="mt-2 text-xs text-muted">
            Step {step + 1} of {steps.length} · {steps[step]}
          </p>
        </div>
        <div className="mt-8 space-y-3 rounded-3xl border border-line bg-white p-6">
          {step === 0 ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                <Field
                  label="Street address"
                  value={street}
                  onChange={(v) => {
                    setStreet(v);
                    searchStreet(v);
                  }}
                  autoComplete="address-line1"
                />
                <Field
                  label="Unit"
                  value={unit}
                  onChange={(v) => setUnit(v.toUpperCase())}
                  placeholder=""
                  autoComplete="address-line2"
                />
              </div>
              {streetSuggestions.length > 0 ? (
                <SuggestionList
                  items={streetSuggestions.map((hit) => ({
                    key: hit.label,
                    label: hit.label,
                    onPick: () => pickStreet(hit),
                  }))}
                />
              ) : null}
              <Field
                label="Neighborhood"
                value={neighborhood}
                onChange={(v) => {
                  setNeighborhood(v);
                  searchNeighborhood(v);
                }}
                autoComplete="off"
              />
              {neighborhoodSuggestions.length > 0 ? (
                <SuggestionList
                  items={neighborhoodSuggestions.map((place) => ({
                    key: place.id,
                    label: place.label,
                    onPick: () => pickNeighborhood(place),
                  }))}
                />
              ) : null}
              <Field label="City" value={city} onChange={setCity} />
            </>
          ) : null}
          {step === 1 ? (
            <AcrisSummaryStep
              state={acris}
              showManual={showManual}
              manual={manual}
              onManualChange={(patch) => setManual((prev) => ({ ...prev, ...patch }))}
              onTryAgain={() => void runAcrisLookup()}
              onPickCandidate={(bbl) => void runAcrisLookup(bbl)}
              onEnterManual={() => setShowManual(true)}
              onGoBack={() => {
                acrisAbort.current?.abort();
                setStep(0);
              }}
            />
          ) : null}
          {step === AGREEMENT_STEP ? (
            awaitingSession ? (
              <p className="text-sm text-muted">Restoring your listing…</p>
            ) : identityHold ? (
              <div className="rounded-2xl border border-line bg-white px-4 py-4">
                <p className="font-medium text-forest">Your agreement is being prepared.</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  We&apos;re completing our brokerage details on this document. Everything
                  you&apos;ve entered is saved — signing takes you straight to your listing.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <section
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white transition",
                    plusOne ? "border-forest" : "border-line",
                    signed && "opacity-90",
                  )}
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-forest">Buyer-agent 1%</h3>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          plusOne ? "bg-lime text-forest" : "bg-warm text-muted",
                        )}
                      >
                        {plusOne ? "On" : "Off"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      Optional offer to agent-represented buyers. Realora still collects 1% —
                      this does not change your fee.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "border-t px-4 py-3",
                      plusOne ? "border-lime bg-lime" : "border-line bg-warm/40",
                    )}
                  >
                    <Checkbox
                      checked={plusOne}
                      disabled={signed}
                      onChange={(next) => void syncCobroke(next)}
                      className="gap-2.5 text-sm font-medium"
                    >
                      Offer 1% to a buyer&apos;s agent
                    </Checkbox>
                    <p className="mt-2 pl-7 text-[11px] leading-4 text-muted">
                      {plusOne
                        ? "Shown on the listing as buyer-agent compensation available."
                        : "Turn on to widen reach with agents shopping for clients."}
                    </p>
                  </div>
                </section>

                {agreementDoc ? (
                  <ListingAgreementView
                    doc={agreementDoc}
                    signatureBoxes={
                      [
                        {
                          role: "Seller",
                          tapToSign: !signed && signedIn,
                          signedAtLabel: sellerSignedAt
                            ? formatSignedStamp(sellerSignedAt)
                            : null,
                          signedBy: sellerSignedAt ? sellerName : null,
                          signatureImageUrl: sellerSignatureUrl,
                          onTapToSign: () => beginSigning(),
                          busy: false,
                        },
                        {
                          role: "Brokerage",
                          countersignPending: Boolean(sellerSignedAt || signed),
                        },
                      ] satisfies SignatureBoxState[]
                    }
                  />
                ) : null}

                {!signedIn ? (
                  <div className="rounded-2xl border border-line bg-white px-4 py-4">
                    <p className="font-semibold text-forest">Sign this agreement</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Create your account to sign. Your intake details come with you.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="lime"
                        disabled={signingBusy}
                        onClick={() => void beginSigning()}
                      >
                        Create account to sign
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => goToAuth("signin", AGREEMENT_STEP)}
                      >
                        Sign in
                      </Button>
                    </div>
                  </div>
                ) : null}

                <SignatureCapture
                  open={captureOpen}
                  title="Sign listing agreement"
                  signerName={sellerName}
                  busy={signingBusy}
                  error={captureError}
                  onClose={() => {
                    setCaptureOpen(false);
                    setCaptureError("");
                  }}
                  onSign={(result) => void submitSellerSignature(result)}
                />
              </div>
            )
          ) : null}
          {step === MEDIA_STEP ? (
            <div className="text-sm">
              <p className="font-medium text-forest">Schedule your media.</p>
              <p className="mt-1 leading-relaxed text-muted">
                We send our photographer to take photography, 3D
                tour, video, and floor plan. Pick a time that works
                and we&apos;ll handle the rest.
              </p>
              <div className="mt-3">
                <ScheduleCalendar
                  date={mediaDate}
                  time={mediaTime}
                  onDateChange={setMediaDate}
                  onTimeChange={setMediaTime}
                />
              </div>
              {!mediaTime ? (
                <p className="mt-2 text-xs text-muted">Confirm a time to continue.</p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
          <div className="flex justify-between pt-2">
            {step === 0 ? (
              <span />
            ) : (
              <Button
                variant="ghost"
                className="px-2.5"
                onClick={() => {
                  if (step === 1) acrisAbort.current?.abort();
                  if (step === AGREEMENT_STEP && signed) return;
                  setStep((s) => s - 1);
                }}
                disabled={step === AGREEMENT_STEP && signed}
              >
                <ChevronLeft size={16} strokeWidth={2} />
                Back
              </Button>
            )}
            {showContinue ? (
              <Button
                variant="lime"
                onClick={() => void next()}
                disabled={continueDisabled()}
              >
                {continueLabel()}
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {step === 0 ? (
          <>
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-[13px] leading-6 text-muted">{FOOT_PRINT}</p>
            </div>

            <div className="relative mt-14 flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[28px] sm:min-h-[26rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sell-for-sale-sign.jpg"
                alt="Realora for-sale sign in front of a home"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-forest/10" />
              <p className="absolute left-5 top-5 z-[2] inline-flex rounded-full bg-lime px-3 py-1 text-xs font-medium tracking-[0.04em] text-forest sm:left-8 sm:top-8">
                Estimate your Net Sheet
              </p>
              <div className="relative z-[1] p-5 sm:p-8">
                <div className="rounded-[24px] bg-cream/95 p-4 shadow-xl backdrop-blur-md sm:p-5">
                  <NetSheetCalculator
                    compact
                    price={sheetPrice}
                    onPriceChange={setSheetPrice}
                    showAskingPrice={false}
                    showPlusOne={false}
                    showKeepLine={false}
                  />
                </div>
              </div>
            </div>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-2 text-lg font-medium tracking-tight">
              <span>You keep</span>
              <span className="rounded-xl bg-lime px-4 py-1.5 text-4xl leading-none">
                {formatPrice(Math.round(sheetPrice * 0.045))}
              </span>
              <span>more with Realora</span>
            </p>

            <FaqSection
              className="mt-14"
              items={FAQ}
              askPlaceholder={FAQ_ASK_PLACEHOLDER}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function asBorough(value: string | undefined) {
  if (!value) return "";
  const match = BOROUGHS.find((name) => name.toLowerCase() === value.trim().toLowerCase());
  return match ?? "";
}

function publicToRecord(row: PublicAcrisRecord): PropertyRecord {
  return {
    bbl: row.bbl,
    normalizedAddress: row.address,
    lat: 0,
    lng: 0,
    borough: row.borough,
    block: row.block,
    lot: row.lot,
    propertyType: row.propertyType,
    ownersOfRecord: row.owners,
    lastSale: null,
    lastDeed: row.lastDeed,
    documentCount: 1,
    openViolations: null,
  };
}

function withUnit(street: string, unit: string) {
  const s = street.trim();
  const u = unit.trim().replace(/^#\s*/, "").toUpperCase();
  if (!s) return "";
  if (!u) return s;
  return `${s} #${u}`;
}

function SuggestionList({
  items,
}: {
  items: { key: string; label: string; onPick: () => void }[];
}) {
  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-white text-sm">
      {items.map((item, i) => (
        <li key={item.key}>
          <button
            type="button"
            className={cn(
              "w-full px-3 py-2 text-left hover:bg-warm",
              i === 0 && "rounded-t-xl",
              i === items.length - 1 && "rounded-b-xl",
              items.length === 1 && "rounded-xl",
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={item.onPick}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line px-3 py-2"
      />
    </label>
  );
}


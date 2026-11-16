"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { ChevronLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { signUpAction } from "@/lib/actions/auth";
import {
  sendAuthEmailCodeAction,
  verifyAuthEmailCodeAction,
  type AuthEmailPurpose,
} from "@/lib/actions/auth-email-code";
import { setIntentAction } from "@/lib/actions/deal";
import {
  AUTH_COPY,
  mapResetError,
  mapSignInError,
  mapSignUpError,
} from "@/lib/auth/map-auth-error";
import { resolveAuthDestination, safeNextPath } from "@/lib/auth/safe-next";
import { isLocalDataMode } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";
import { hydrateSupabaseStore } from "@/lib/data/supabase-store";
import { isSeedDevEmail } from "@/lib/auth/seed-accounts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/format";

type Mode = "signin" | "signup" | "forgot" | "verify";

/** level 0 empty · 1 weak · 2 medium · 3 strong */
function passwordStrength(password: string): { label: string; level: 0 | 1 | 2 | 3 } {
  if (password.length === 0) return { label: "", level: 0 };
  if (password.length < 8) return { label: "weak", level: 1 };
  let points = 1;
  if (password.length >= 10) points += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;
  if (points <= 2) return { label: "weak", level: 1 };
  if (points <= 3) return { label: "medium", level: 2 };
  return { label: "strong", level: 3 };
}

const STRENGTH_STEPS = [
  { level: 1 as const, label: "weak", fill: "bg-[#E24B2D]", text: "text-[#E24B2D]" },
  { level: 2 as const, label: "medium", fill: "bg-[#E5B84A]", text: "text-[#C49A2E]" },
  { level: 3 as const, label: "strong", fill: "bg-[#3FA34D]", text: "text-[#2F8A3C]" },
];

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const intentParam = params.get("intent");
  const modeParam = params.get("mode");
  const nextRaw = params.get("next");

  const signInStore = useAppData((s) => s.signIn);

  const [mode, setMode] = useState<Mode>(() => {
    if (modeParam === "signup") return "signup";
    if (modeParam === "forgot") return "forgot";
    return "signin";
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roleChoice, setRoleChoice] = useState<"buyer" | "seller" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verifyPurpose, setVerifyPurpose] = useState<AuthEmailPurpose>("signin");
  const [pendingRole, setPendingRole] = useState<Role>("buyer");
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const otpDigits = useMemo(
    () => Array.from({ length: 6 }, (_, i) => otpCode[i] ?? ""),
    [otpCode],
  );

  function setOtpAt(index: number, digit: string) {
    const next = otpDigits.map((d, i) => (i === index ? digit : d));
    setOtpCode(next.join("").replace(/\D/g, "").slice(0, 6));
  }

  function focusOtp(index: number) {
    otpRefs.current[Math.max(0, Math.min(5, index))]?.focus();
  }

  function onOtpChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setOtpAt(index, "");
      return;
    }
    if (digits.length > 1) {
      // Paste or autofill into one box — fill forward from here.
      const merged = (otpCode.slice(0, index) + digits)
        .replace(/\D/g, "")
        .slice(0, 6);
      setOtpCode(merged);
      focusOtp(Math.min(5, index + digits.length - 1));
      return;
    }
    setOtpAt(index, digits);
    if (index < 5) focusOtp(index + 1);
  }

  function onOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (otpDigits[index]) {
        setOtpAt(index, "");
      } else if (index > 0) {
        setOtpAt(index - 1, "");
        focusOtp(index - 1);
      }
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusOtp(index - 1);
    }
    if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      focusOtp(index + 1);
    }
  }

  function onOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtpCode(digits);
    focusOtp(Math.min(5, digits.length - 1));
  }
  const intentLocked =
    intentParam === "buying" || intentParam === "selling"
      ? intentParam
      : intentParam === "offer"
        ? "buying"
        : null;

  const strength = useMemo(() => passwordStrength(password), [password]);

  useEffect(() => {
    if (isLocalDataMode()) return;
    if (params.get("provider") !== "google") return;
    const supabase = createBrowserSupabaseClient();
    const dest = resolveAuthDestination(nextRaw, intentParam);
    void supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
      },
    });
  }, [params, nextRaw, intentParam]);

  function authQuery(overrides: Record<string, string | null>) {
    const q = new URLSearchParams();
    const next = overrides.next !== undefined ? overrides.next : nextRaw;
    const intent = overrides.intent !== undefined ? overrides.intent : intentParam;
    const modeVal = overrides.mode !== undefined ? overrides.mode : null;
    if (next) q.set("next", next);
    if (intent) q.set("intent", intent);
    if (modeVal) q.set("mode", modeVal);
    const s = q.toString();
    return s ? `/auth?${s}` : "/auth";
  }

  function resolveDestination(role: Role) {
    return resolveAuthDestination(nextRaw, intentParam, role);
  }

  async function afterSupabaseSession(role: Role) {
    signInStore(
      email.trim().toLowerCase() || "you@realora.dev",
      role,
    );
    if (intentLocked) {
      await setIntentAction(intentLocked);
    } else if (roleChoice) {
      await setIntentAction(roleChoice === "seller" ? "selling" : "buying");
    }
    await hydrateSupabaseStore();
    router.push(resolveDestination(role));
    router.refresh();
  }

  async function beginEmailVerification(role: Role, purpose: AuthEmailPurpose) {
    const normalized = email.trim().toLowerCase();
    if (isSeedDevEmail(normalized)) {
      await afterSupabaseSession(role);
      return;
    }
    const sent = await sendAuthEmailCodeAction({ email: normalized, purpose });
    if (!sent.ok) {
      setError(sent.message);
      return;
    }
    setPendingRole(role);
    setVerifyPurpose(purpose);
    setOtpCode("");
    setDevCode(sent.data.devCode ?? null);
    setMode("verify");
    setError("");
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLocalDataMode()) {
        const role: Role =
          intentLocked === "selling" || roleChoice === "seller" ? "seller" : "buyer";
        signInStore(email, role);
        router.push(resolveDestination(role));
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        setError(mapSignInError(authError.message));
        return;
      }
      const role: Role =
        intentLocked === "selling" || roleChoice === "seller" ? "seller" : "buyer";
      await beginEmailVerification(role, "signin");
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const resolvedIntent =
      intentLocked ??
      (roleChoice === "seller" ? "selling" : roleChoice === "buyer" ? "buying" : null);

    if (!intentLocked && !roleChoice) {
      setError("Choose whether you're selling or buying.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setBusy(true);
    try {
      if (isLocalDataMode()) {
        const role: Role = resolvedIntent === "selling" ? "seller" : "buyer";
        signInStore(email, role);
        router.push(resolveDestination(role));
        return;
      }

      const created = await signUpAction({
        name,
        email,
        password,
        intent: resolvedIntent,
      });
      if (!created.ok) {
        setError(mapSignUpError(created.message));
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        setError(mapSignInError(authError.message));
        return;
      }

      const role: Role = resolvedIntent === "selling" ? "seller" : "buyer";
      await beginEmailVerification(role, "signup");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const verified = await verifyAuthEmailCodeAction({
        email,
        purpose: verifyPurpose,
        code: otpCode,
      });
      if (!verified.ok) {
        setError(verified.message);
        return;
      }
      await afterSupabaseSession(pendingRole);
    } finally {
      setBusy(false);
    }
  }

  async function onResendCode() {
    setError("");
    setBusy(true);
    try {
      const sent = await sendAuthEmailCodeAction({
        email,
        purpose: verifyPurpose,
      });
      if (!sent.ok) {
        setError(sent.message);
        return;
      }
      setDevCode(sent.data.devCode ?? null);
      setOtpCode("");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLocalDataMode()) {
        setError(AUTH_COPY.smtpUnconfigured);
        return;
      }
      if (isSeedDevEmail(email)) {
        setError(
          "Dev accounts use the passwords in the README — they don't go through email reset.",
        );
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth?mode=signin")}`,
        },
      );
      if (resetError) {
        setError(mapResetError(resetError.message));
        return;
      }
      // Dev projects without SMTP often still return ok; be honest when we can't know.
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "verify"
      ? "Check your email"
      : mode === "signup"
        ? "Create your account"
        : mode === "forgot"
          ? "Reset password"
          : "Sign in";

  const showRolePicker = mode === "signup" && !intentLocked;

  const abandonHref =
    nextRaw && (nextRaw.startsWith("/sell/onboarding") || nextRaw.startsWith("/sell?"))
      ? safeNextPath(nextRaw, "/sell?resume=1")
      : null;

  return (
    <AuthShell
      title={title}
      footer={
        abandonHref ? (
          <Button href={abandonHref} variant="ghost" className="h-9 px-2.5 text-forest">
            <ChevronLeft size={16} strokeWidth={2} />
            Back to your listing intake
          </Button>
        ) : undefined
      }
    >
      {mode === "verify" ? (
        <form onSubmit={(e) => void onVerify(e)} className="space-y-5">
          <p className="whitespace-nowrap text-sm leading-6 text-muted">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-forest">
              {email.trim().toLowerCase()}
            </span>
            . Enter it below.
          </p>
          {devCode ? (
            <p className="rounded-xl border border-line bg-warm/60 px-3 py-2 text-sm text-forest">
              Email isn’t configured on this project — use code{" "}
              <span className="font-semibold tracking-widest">{devCode}</span>
            </p>
          ) : null}
          <div className="flex justify-center gap-2.5">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1} of 6`}
                maxLength={1}
                value={digit}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e)}
                onPaste={onOtpPaste}
                onFocus={(e) => e.currentTarget.select()}
                className="h-12 w-10 shrink-0 rounded-xl border border-line bg-white text-center text-[22px] font-medium tabular-nums text-forest outline-none transition-colors focus:border-forest focus:bg-cream"
              />
            ))}
          </div>
          {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
          <Button
            type="submit"
            variant="lime"
            disabled={busy || otpCode.length !== 6}
            className="w-full"
          >
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>
          <p className="text-center text-sm text-muted">
            <button
              type="button"
              className="font-medium text-forest underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => void onResendCode()}
            >
              Resend code
            </button>
          </p>
        </form>
      ) : mode === "forgot" ? (
        <form onSubmit={(e) => void onForgot(e)} className="space-y-4">
          {resetSent ? (
            <p className="text-sm text-forest">
              If this project can send mail, a reset link is on its way. On this
              development project SMTP is often unset — if nothing arrives, set
              Supabase Auth custom SMTP (see README) or sign in with your known password.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5"
                />
              </label>
              {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
              <Button type="submit" variant="lime" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-center text-sm text-muted">
                <Link
                  href={authQuery({ mode: "signin" })}
                  className="font-medium text-forest underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signin");
                    setError("");
                    setResetSent(false);
                    router.replace(authQuery({ mode: null }));
                  }}
                >
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </form>
      ) : mode === "signup" ? (
        <form onSubmit={(e) => void onSignUp(e)} className="space-y-4">
          <label className="block text-sm">
            Name
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5"
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5"
            />
          </label>
          <label className="block text-sm">
            Password
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 pr-16"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-forest"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="mt-2">
              <div
                className="grid grid-cols-3 gap-1"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={strength.level}
                aria-label="Password strength"
              >
                {STRENGTH_STEPS.map((step) => (
                  <div
                    key={step.level}
                    className={cn(
                      "h-1.5 rounded-sm transition-colors",
                      strength.level === step.level ? step.fill : "bg-line",
                    )}
                  />
                ))}
              </div>
              <div className="mt-1 grid h-4 grid-cols-3 gap-1 text-center text-xs leading-4">
                {!password ? (
                  <p className="col-span-3 text-left text-muted">At least 8 characters.</p>
                ) : (
                  STRENGTH_STEPS.map((step) => (
                    <span
                      key={step.level}
                      className={cn(
                        "transition-colors",
                        strength.level === step.level ? step.text : "text-transparent",
                      )}
                    >
                      {step.label}
                    </span>
                  ))
                )}
              </div>
            </div>
          </label>

          {showRolePicker ? (
            <div>
              <p className="text-sm">I&apos;m</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["seller", "selling"],
                    ["buyer", "buying"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRoleChoice(key)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition",
                      roleChoice === key
                        ? "border-forest bg-forest text-cream"
                        : "border-line bg-white text-forest hover:bg-warm",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : intentLocked ? (
            <p className="text-sm text-muted">
              Continuing as{" "}
              <span className="font-medium text-forest">
                {intentLocked === "selling" ? "a seller." : "a buyer."}
              </span>
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-[#9A3B2F]">
              {error.includes("sign in instead") ? (
                <>
                  An account with that email already exists —{" "}
                  <Link
                    href={authQuery({ mode: "signin" })}
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      setMode("signin");
                      setError("");
                      router.replace(authQuery({ mode: null }));
                    }}
                  >
                    sign in instead
                  </Link>
                </>
              ) : (
                error
              )}
            </p>
          ) : null}

          <Button type="submit" variant="lime" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link
              href={authQuery({ mode: "signin" })}
              className="font-medium text-forest underline-offset-2 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setMode("signin");
                setError("");
                router.replace(authQuery({ mode: null }));
              }}
            >
              Sign in
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={(e) => void onSignIn(e)} className="space-y-4">
          <label className="block text-sm">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5"
            />
          </label>

          <label className="block text-sm">
            Password
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required={!isLocalDataMode()}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 pr-16"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-forest"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {!isLocalDataMode() ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-medium text-muted hover:text-forest"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setResetSent(false);
                  router.replace(authQuery({ mode: "forgot" }));
                }}
              >
                Forgot password
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}

          <Button type="submit" variant="lime" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted">
            New to Realora?{" "}
            <Link
              href={authQuery({ mode: "signup" })}
              className="font-medium text-forest underline-offset-2 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setMode("signup");
                setError("");
                router.replace(authQuery({ mode: "signup" }));
              }}
            >
              Create an account
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-12 text-sm text-muted">Loading…</div>
      }
    >
      <AuthInner />
    </Suspense>
  );
}

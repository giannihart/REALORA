"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fail, type ActionResult } from "@/lib/actions/errors";
import { isLocalDataMode } from "@/lib/data/mode";

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  intent: "buying" | "selling" | null;
};

/**
 * Creates an Auth user + profile in one motion, matching the seed/rehearsal path:
 * admin.createUser with email_confirm: true so accounts are usable immediately
 * on this project without SMTP. When production SMTP lands, flip confirmations
 * on in the Supabase dashboard (see README env inventory).
 */
export async function signUpAction(
  input: SignUpInput,
): Promise<ActionResult<{ email: string }>> {
  if (isLocalDataMode()) {
    return fail("unavailable", "Sign-up runs in supabase mode.");
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name) return fail("validation", "Enter your name.");
  if (!email || !email.includes("@")) return fail("validation", "Enter a valid email.");
  if (password.length < 8) {
    return fail("validation", "Use at least 8 characters for your password.");
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (error || !data.user) {
      const msg = error?.message ?? "Could not create account.";
      if (
        /already|registered|exists|duplicate|unique/i.test(msg) ||
        error?.status === 422
      ) {
        return fail(
          "validation",
          "An account with that email already exists — sign in instead",
        );
      }
      if (/rate|too many|429/i.test(msg) || error?.status === 429) {
        return fail(
          "validation",
          "Too many attempts — wait a minute and try again.",
        );
      }
      return fail("validation", "Couldn't create that account. Check your details and try again.");
    }

    const updates: { full_name: string; intent?: "buying" | "selling" } = {
      full_name: name,
    };
    if (input.intent === "buying" || input.intent === "selling") {
      updates.intent = input.intent;
    }
    await admin.from("profiles").update(updates).eq("id", data.user.id);

    return { ok: true, data: { email } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/rate|too many|429/i.test(message)) {
      return fail(
        "validation",
        "Too many attempts — wait a minute and try again.",
      );
    }
    return fail("validation", "Couldn't create that account. Check your details and try again.");
  }
}

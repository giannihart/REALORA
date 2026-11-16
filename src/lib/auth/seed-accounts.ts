/** Sign-in accounts maintained by the project seed. Profile-only competing buyers are not listed. */
export const SEED_DEV_EMAILS = [
  "seller@realora.dev",
  "buyer@realora.dev",
  "broker@realora.dev",
] as const;

export function isSeedDevEmail(email: string): boolean {
  return (SEED_DEV_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

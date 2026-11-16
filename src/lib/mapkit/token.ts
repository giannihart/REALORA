import "server-only";

import { createPrivateKey, sign } from "node:crypto";

function pemFromEnv(raw: string) {
  const key = raw.replace(/\\n/g, "\n").trim();
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
}

function originOf(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function mapkitConfigured() {
  return Boolean(
    process.env.MAPKIT_TEAM_ID && process.env.MAPKIT_KEY_ID && process.env.MAPKIT_PRIVATE_KEY,
  );
}

export function createMapKitToken(request: Request) {
  const teamId = process.env.MAPKIT_TEAM_ID?.trim();
  const keyId = process.env.MAPKIT_KEY_ID?.trim();
  const privateKey = process.env.MAPKIT_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKey) return null;

  const origin =
    process.env.MAPKIT_ORIGIN?.trim() ||
    originOf(request.headers.get("origin")) ||
    originOf(process.env.NEXT_PUBLIC_SITE_URL) ||
    "http://localhost:3000";

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 50 * 60,
      origin,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const key = createPrivateKey(pemFromEnv(privateKey));
  const signature = sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
  return `${data}.${signature.toString("base64url")}`;
}

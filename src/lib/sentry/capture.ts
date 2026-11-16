/**
 * Errors-only Sentry ingest (no session replay, no SDK).
 * Parses SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN and POSTs a store event.
 */
function parseDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const key = url.username;
    const project = url.pathname.replace(/^\//, "");
    if (!key || !project) return null;
    return {
      store: `${url.protocol}//${url.host}/api/${project}/store/`,
      key,
    };
  } catch {
    return null;
  }
}

export function sentryDsn(): string | null {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || null;
}

export function captureError(error: unknown, extras: Record<string, unknown> = {}) {
  const dsn = sentryDsn();
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    logger: "realora",
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? { frames: err.stack.split("\n").slice(1).reverse().map((line) => ({ filename: line.trim() })) }
            : undefined,
        },
      ],
    },
    extra: extras,
  };
  const auth = `Sentry sentry_version=7, sentry_client=realora/1.0, sentry_key=${parsed.key}`;
  void fetch(parsed.store, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": auth,
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

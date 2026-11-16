export async function register() {
  const { sentryDsn } = await import("./lib/sentry/capture");
  if (!sentryDsn()) return;
}

export async function onRequestError(
  error: unknown,
  request: { path?: string },
  context: { routerKind?: string },
) {
  const { captureError } = await import("./lib/sentry/capture");
  captureError(error, { path: request.path, routerKind: context.routerKind });
}

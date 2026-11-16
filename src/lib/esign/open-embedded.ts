/**
 * Client-only helper: open Dropbox Sign (HelloSign) embedded signing in-page.
 */
export async function openDropboxEmbeddedSign(input: {
  signUrl: string;
  clientId: string;
  testMode?: boolean;
  onSign?: () => void;
  onCancel?: () => void;
  onError?: () => void;
}): Promise<void> {
  const HelloSign = (
    await import("hellosign-embedded")
  ).default as unknown as {
    new (opts: { skipDomainVerification: boolean }): {
      open: (url: string, opts: Record<string, unknown>) => void;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  };
  const client = new HelloSign({ skipDomainVerification: true });
  client.open(input.signUrl, {
    clientId: input.clientId,
    skipDomainVerification: true,
    testMode: input.testMode !== false,
  });
  if (input.onSign) client.on("sign", () => input.onSign?.());
  if (input.onCancel) client.on("cancel", () => input.onCancel?.());
  if (input.onError) client.on("error", () => input.onError?.());
}

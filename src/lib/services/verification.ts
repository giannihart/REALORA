export type VerificationKind = "id" | "ownership";

export interface VerificationService {
  start(kind: VerificationKind): Promise<{ sessionId: string }>;
  complete(sessionId: string): Promise<{ verified: boolean }>;
}

export const verificationService: VerificationService = {
  async start(kind: VerificationKind) {
    return { sessionId: `persona_${kind}_${Date.now()}` };
  },
  async complete(sessionId: string) {
    void sessionId;
    return { verified: true };
  },
};

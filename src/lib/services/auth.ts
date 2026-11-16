export interface AuthService {
  sendMagicLink(email: string): Promise<{ ok: true; demoCode: string }>;
  completeMagicLink(email: string, code: string): Promise<{ ok: boolean }>;
}

export const authService: AuthService = {
  async sendMagicLink(email: string) {
    return { ok: true, demoCode: email.trim() ? "1842" : "0000" };
  },
  async completeMagicLink(email: string, code: string) {
    void email;
    return { ok: code.replace(/\s/g, "").length >= 4 };
  },
};

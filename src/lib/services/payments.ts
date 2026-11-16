export interface PaymentIntent {
  id: string;
  amount: number;
  status: "requires_confirmation" | "succeeded";
}

export interface PaymentsService {
  createDepositIntent(amount: number): Promise<PaymentIntent>;
  confirm(id: string): Promise<PaymentIntent>;
}

export const paymentsService: PaymentsService = {
  async createDepositIntent(amount: number) {
    return { id: `pi_demo_${Date.now()}`, amount, status: "requires_confirmation" };
  },
  async confirm(id: string) {
    return { id, amount: 0, status: "succeeded" };
  },
};

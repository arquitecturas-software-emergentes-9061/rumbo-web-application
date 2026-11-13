export interface PaymentOrder {
  orderId: string;
  planCode: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  currency: string;
  createdAt: string;
}

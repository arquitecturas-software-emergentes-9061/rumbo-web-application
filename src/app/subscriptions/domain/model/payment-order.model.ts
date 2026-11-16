import { BillingDetails } from './billing-details.model';

export interface PaymentOrder {
  billing: BillingDetails | null;
  paidAt: string | null;
  receipt?: { number: string; issuedAt: string } | null;
  organization: { id: string; name: string };
  orderId: string;
  planCode: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  currency: string;
  createdAt: string;
}

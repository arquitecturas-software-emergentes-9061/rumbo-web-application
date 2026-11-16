import { BillingDetails } from './billing-details.model';

export type PlanCode = 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
export type PurchaseMode = 'CHECKOUT' | 'CONTACT_SALES';

export interface Money {
  amount: number;
  currency: string;
}

export interface SubscriptionPlan {
  quota: PlanQuota;
  code: PlanCode;
  name: string;
  price: Money;
  billingInterval: 'MONTH';
  purchaseMode: PurchaseMode;
}

export interface PlanQuota {
  sites: number | null;
  floors: number | null;
  beacons: number | null;
}

export type CheckoutPlanCode = Exclude<PlanCode, 'ENTERPRISE'>;

export interface CheckoutSession {
  billing: BillingDetails;
  organization: { id: string; name: string };
  orderId: string;
  planCode: CheckoutPlanCode;
  status: 'PENDING';
  amount: number;
  currency: string;
  checkoutUrl: string;
}

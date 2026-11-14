export type PlanCode = 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
export type PurchaseMode = 'CHECKOUT' | 'CONTACT_SALES';

export interface Money {
  amount: number;
  currency: string;
}

export interface SubscriptionPlan {
  code: PlanCode;
  name: string;
  price: Money;
  billingInterval: 'MONTH';
  purchaseMode: PurchaseMode;
}

export type CheckoutPlanCode = Exclude<PlanCode, 'ENTERPRISE'>;

export interface CheckoutSession {
  orderId: string;
  planCode: CheckoutPlanCode;
  status: 'PENDING';
  amount: number;
  currency: string;
  checkoutUrl: string;
}

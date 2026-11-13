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

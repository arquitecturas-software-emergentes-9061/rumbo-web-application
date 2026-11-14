import { Money, PlanCode, PlanQuota } from './subscription-plan.model';

export interface MySubscription {
  status: 'ACTIVE' | 'EXPIRED';
  plan: { code: PlanCode; name: string; price: Money; billingInterval: 'MONTH'; quota: PlanQuota };
  usage: Record<keyof PlanQuota, { used: number; limit: number | null }>;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  daysRemaining: number;
}

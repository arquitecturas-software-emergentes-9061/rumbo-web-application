import { Money, PlanCode } from './subscription-plan.model';

export interface MySubscription {
  status: 'ACTIVE' | 'EXPIRED';
  plan: { code: PlanCode; name: string; price: Money; billingInterval: 'MONTH' };
  currentPeriodStart: string;
  currentPeriodEnd: string;
  daysRemaining: number;
}

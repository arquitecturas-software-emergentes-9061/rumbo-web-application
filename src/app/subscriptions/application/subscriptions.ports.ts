import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { MySubscription } from '../domain/model/my-subscription.model';
import { PaymentOrder } from '../domain/model/payment-order.model';
import { CheckoutPlanCode, CheckoutSession, SubscriptionPlan } from '../domain/model/subscription-plan.model';

export interface SubscriptionsPort {
  loadPlans(): Observable<SubscriptionPlan[]>;
  createCheckoutSession(planCode: CheckoutPlanCode): Observable<CheckoutSession>;
  getPaymentOrder(orderId: string): Observable<PaymentOrder>;
  getMySubscription(): Observable<MySubscription | null>;
}
export const SUBSCRIPTIONS_PORT = new InjectionToken<SubscriptionsPort>('Subscriptions plan catalog');

export interface BrowserNavigationPort {
  assign(url: string): void;
}
export const BROWSER_NAVIGATION = new InjectionToken<BrowserNavigationPort>('Full-page browser navigation');

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { PaymentOrder } from '../domain/model/payment-order.model';
import { SubscriptionPlan } from '../domain/model/subscription-plan.model';

export interface SubscriptionsPort {
  loadPlans(): Observable<SubscriptionPlan[]>;
  getPaymentOrder(orderId: string): Observable<PaymentOrder>;
}
export const SUBSCRIPTIONS_PORT = new InjectionToken<SubscriptionsPort>('Subscriptions plan catalog');

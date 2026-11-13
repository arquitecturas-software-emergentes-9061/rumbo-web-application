import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { SubscriptionPlan } from '../domain/model/subscription-plan.model';

export interface SubscriptionsPort {
  loadPlans(): Observable<SubscriptionPlan[]>;
}
export const SUBSCRIPTIONS_PORT = new InjectionToken<SubscriptionsPort>('Subscriptions plan catalog');

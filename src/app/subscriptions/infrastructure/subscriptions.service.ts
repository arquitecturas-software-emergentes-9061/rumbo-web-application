import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MySubscription } from '../domain/model/my-subscription.model';
import { SubscriptionPlan } from '../domain/model/subscription-plan.model';
import { SubscriptionsPort } from '../application/subscriptions.ports';
import { PaymentOrder } from '../domain/model/payment-order.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionsService implements SubscriptionsPort {
  private readonly http = inject(HttpClient);
  private readonly plansUrl = environment.apiUrl + '/subscriptions/plans';

  loadPlans() {
    return this.http.get<SubscriptionPlan[]>(this.plansUrl);
  }

  getMySubscription() {
    return this.http.get<MySubscription>(environment.apiUrl + '/subscriptions/me').pipe(
      catchError(error => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  getPaymentOrder(orderId: string) {
    return this.http.get<PaymentOrder>(
      environment.apiUrl + '/subscriptions/payment-orders/' + encodeURIComponent(orderId)
    );
  }
}

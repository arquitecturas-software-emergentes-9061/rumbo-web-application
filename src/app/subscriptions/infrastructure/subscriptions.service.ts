import { HttpClient } from '@angular/common/http';
import { BillingDetails } from '../domain/model/billing-details.model';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { ContractingClinic } from '../domain/model/contracting-clinic.model';
import { environment } from '../../../environments/environment';
import { MySubscription } from '../domain/model/my-subscription.model';
import { CheckoutPlanCode, CheckoutSession, SubscriptionPlan } from '../domain/model/subscription-plan.model';
import { SubscriptionsPort } from '../application/subscriptions.ports';
import { PaymentOrder } from '../domain/model/payment-order.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionsService implements SubscriptionsPort {
  private readonly http = inject(HttpClient);
  private readonly plansUrl = environment.apiUrl + '/subscriptions/plans';

  createCheckoutSession(planCode: CheckoutPlanCode, billing: BillingDetails) {
    return this.http.post<CheckoutSession>(
      environment.apiUrl + '/subscriptions/checkout-sessions', { planCode, billing }
    );
  }

  getContractingClinic() {
    return this.http.get<ContractingClinic>(environment.apiUrl + '/clinics/me').pipe(
      catchError(error => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  getMySubscription() {
    return this.http.get<MySubscription>(environment.apiUrl + '/subscriptions/me').pipe(
      catchError(error => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  loadPlans() {
    return this.http.get<SubscriptionPlan[]>(this.plansUrl);
  }

  getPaymentOrder(orderId: string) {
    return this.http.get<PaymentOrder>(
      environment.apiUrl + '/subscriptions/payment-orders/' + encodeURIComponent(orderId)
    );
  }
}

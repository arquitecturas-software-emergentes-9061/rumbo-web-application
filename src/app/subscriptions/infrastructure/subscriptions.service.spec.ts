import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { SubscriptionPlan } from '../domain/model/subscription-plan.model';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService HTTP contract', () => {
  let service: SubscriptionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SubscriptionsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('gets the catalog from the subscriptions plans endpoint', () => {
    const plans: SubscriptionPlan[] = [{
      code: 'BASIC', name: 'Básico', price: { amount: 39.90, currency: 'PEN' },
      billingInterval: 'MONTH', purchaseMode: 'CHECKOUT'
    }];
    service.loadPlans().subscribe(result => expect(result).toEqual(plans));
    http.expectOne({ method: 'GET', url: environment.apiUrl + '/subscriptions/plans' }).flush(plans);
  });
  it('posts the chosen plan to create a checkout session', () => {
    const session = {
      orderId: 'order-1', planCode: 'BASIC', status: 'PENDING', amount: 39.90,
      organization: { id: 'clinic-1', name: 'Clinic' },
      currency: 'PEN', checkoutUrl: 'https://checkout.stripe.com/c/pay/test'
    };
    const billing = { legalName: 'Clínica Rumbo', ruc: '20123456789', fiscalAddress: 'Av. Lima 123', billingEmail: 'pagos@example.com' };
    service.createCheckoutSession('BASIC', billing).subscribe(result => expect(result).toEqual(session));
    const request = http.expectOne({
      method: 'POST', url: environment.apiUrl + '/subscriptions/checkout-sessions'
    });
    expect(request.request.body).toEqual({ planCode: 'BASIC', billing });
    request.flush(session, { status: 201, statusText: 'Created' });
  });

  it('gets a payment order using an encoded identifier', () => {
    service.getPaymentOrder('order/with space').subscribe();
    http.expectOne({ method: 'GET', url: environment.apiUrl + '/subscriptions/payment-orders/order%2Fwith%20space' }).flush({});
  });

  it('gets my subscription', () => {
    const subscription = { status: 'ACTIVE', daysRemaining: 30 };
    service.getMySubscription().subscribe(result => expect(result).toEqual(subscription));
    http.expectOne({ method: 'GET', url: environment.apiUrl + '/subscriptions/me' }).flush(subscription);
  });

  it('returns null for a missing subscription', () => {
    service.getMySubscription().subscribe(result => expect(result).toBeNull());
    http.expectOne(environment.apiUrl + '/subscriptions/me').flush(
      { code: 'SUBSCRIPTION_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  });

  it.each([0, 401, 403, 500])('propagates subscription error %s', status => {
    const failed = vi.fn();
    service.getMySubscription().subscribe({ error: failed });
    const request = http.expectOne(environment.apiUrl + '/subscriptions/me');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Error' });
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ status }));
  });
});

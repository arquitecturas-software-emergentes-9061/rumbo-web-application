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
});

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { subscriptionRestrictionInterceptor } from './subscription-restriction.interceptor';
import { SubscriptionRestrictionStore } from '../../application/subscription-restriction.store';
import { restrictionFrom } from '../../domain/model/subscription-restriction.model';

describe('Subscription restrictions (WI-US23-03)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: SubscriptionRestrictionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([subscriptionRestrictionInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SubscriptionRestrictionStore);
  });

  afterEach(() => backend.verify());

  it('reports an expired plan and blocks writes, passing the error on to the page', () => {
    let received: unknown;
    http.post('/api/v1/sites', {}).subscribe({ error: error => received = error });

    backend.expectOne('/api/v1/sites').flush(
      { code: 'SUBSCRIPTION_INACTIVE', standing: 'EXPIRED', detail: 'The clinic subscription is not active' },
      { status: 403, statusText: 'Forbidden' });

    expect(store.restriction()).toEqual({ kind: 'INACTIVE', standing: 'EXPIRED', message: 'The clinic subscription is not active' });
    expect(store.writesBlocked()).toBe(true);
    expect(received).toBeTruthy();
  });

  it('reports a plan limit without blocking the rest of the writes', () => {
    http.post('/api/v1/sites/s1/beacons', {}).subscribe({ error: () => undefined });

    backend.expectOne('/api/v1/sites/s1/beacons').flush(
      { code: 'PLAN_LIMIT_EXCEEDED', resource: 'BEACON', detail: 'Beacon quota reached' },
      { status: 409, statusText: 'Conflict' });

    expect(store.restriction()).toEqual({ kind: 'PLAN_LIMIT', resource: 'BEACON', message: 'Beacon quota reached' });
    expect(store.writesBlocked()).toBe(false);
  });

  it('ignores other permission errors so ownership denials keep their own handling', () => {
    http.get('/api/v1/sites/s2/beacons').subscribe({ error: () => undefined });

    backend.expectOne('/api/v1/sites/s2/beacons').flush(
      { code: 'ACCESS_DENIED', detail: 'You are not allowed to perform this operation' },
      { status: 403, statusText: 'Forbidden' });

    expect(store.restriction()).toBeNull();
  });

  it('can be dismissed by the user', () => {
    store.report({ kind: 'INACTIVE', standing: 'NONE', message: '' });
    store.dismiss();
    expect(store.restriction()).toBeNull();
    expect(store.writesBlocked()).toBe(false);
  });

  it('treats a never-subscribed clinic apart from an expired one and tolerates bodies that are not problems', () => {
    expect(restrictionFrom(403, { code: 'SUBSCRIPTION_INACTIVE', standing: 'NONE' })).toMatchObject({ standing: 'NONE' });
    expect(restrictionFrom(403, 'Forbidden')).toBeNull();
    expect(restrictionFrom(500, null)).toBeNull();
  });
});

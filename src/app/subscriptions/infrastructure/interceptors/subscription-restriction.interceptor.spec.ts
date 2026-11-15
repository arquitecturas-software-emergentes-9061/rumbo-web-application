import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { subscriptionRestrictionInterceptor } from './subscription-restriction.interceptor';
import { SubscriptionRestrictionStore } from '../../application/subscription-restriction.store';
import { resourceFromUrl, restrictionFrom } from '../../domain/model/subscription-restriction.model';

describe('Subscription restrictions (WI-US23-03, PR-99)', () => {
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

  it('reports an expired plan when a site is edited and blocks writes, passing the error on to the page', () => {
    let received: unknown;
    http.put('/api/v1/sites/s1', {}).subscribe({ error: error => received = error });

    backend.expectOne('/api/v1/sites/s1').flush(
      { code: 'SUBSCRIPTION_REQUIRED', standing: 'EXPIRED', detail: 'The clinic subscription has expired' },
      { status: 403, statusText: 'Forbidden' });

    expect(store.restriction()).toEqual({ kind: 'INACTIVE', standing: 'EXPIRED', message: 'The clinic subscription has expired' });
    expect(store.writesBlocked()).toBe(true);
    expect(received).toBeTruthy();
  });

  it('reports a creation rejected for lack of an active plan', () => {
    http.post('/api/v1/sites', {}).subscribe({ error: () => undefined });

    backend.expectOne('/api/v1/sites').flush(
      { code: 'SUBSCRIPTION_REQUIRED', detail: 'An active subscription is required to register sites, floors or beacons' },
      { status: 409, statusText: 'Conflict' });

    expect(store.restriction()).toMatchObject({ kind: 'INACTIVE', standing: 'UNKNOWN' });
    expect(store.writesBlocked()).toBe(true);
  });

  it('reports a plan quota with its limit and the resource of the URL, without blocking the rest of the writes', () => {
    http.post('/api/v1/sites/s1/beacons', {}).subscribe({ error: () => undefined });

    backend.expectOne('/api/v1/sites/s1/beacons').flush(
      { code: 'PLAN_QUOTA_EXCEEDED', limit: 20, detail: 'Your plan allows at most 20 beacons' },
      { status: 409, statusText: 'Conflict' });

    expect(store.restriction()).toEqual(
      { kind: 'PLAN_LIMIT', resource: 'BEACON', limit: 20, message: 'Your plan allows at most 20 beacons' });
    expect(store.writesBlocked()).toBe(false);
  });

  it('sends each request once: a restriction is never retried', () => {
    http.post('/api/v1/sites', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/sites').flush({ code: 'PLAN_QUOTA_EXCEEDED', limit: 1 },
      { status: 409, statusText: 'Conflict' });
    backend.expectNone('/api/v1/sites');
  });

  it('ignores other permission and conflict errors so they keep their own handling', () => {
    http.get('/api/v1/sites/s2/beacons').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/sites/s2/beacons').flush(
      { code: 'ACCESS_DENIED', detail: 'You are not allowed to perform this operation' },
      { status: 403, statusText: 'Forbidden' });

    http.post('/api/v1/sites/s2/beacons', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/sites/s2/beacons').flush(
      { code: 'DUPLICATE_BEACON_IDENTIFIER' }, { status: 409, statusText: 'Conflict' });

    expect(store.restriction()).toBeNull();
  });

  it('can be dismissed by the user', () => {
    store.report({ kind: 'INACTIVE', standing: 'NONE', message: '' });
    store.dismiss();
    expect(store.restriction()).toBeNull();
    expect(store.writesBlocked()).toBe(false);
  });

  it('treats a never-subscribed clinic apart from an expired one and tolerates bodies that are not problems', () => {
    expect(restrictionFrom(403, { code: 'SUBSCRIPTION_REQUIRED', standing: 'NONE' })).toMatchObject({ standing: 'NONE' });
    expect(restrictionFrom(403, 'Forbidden')).toBeNull();
    expect(restrictionFrom(500, null)).toBeNull();
    expect(restrictionFrom(409, { code: 'PLAN_QUOTA_EXCEEDED' }, '/api/v1/sites')).toMatchObject({ limit: null });
  });

  it('reads the resource from the creation URL', () => {
    expect(resourceFromUrl('http://localhost:8080/api/v1/sites')).toBe('SITE');
    expect(resourceFromUrl('/api/v1/sites/abc/floors/')).toBe('FLOOR');
    expect(resourceFromUrl('/api/v1/sites/abc/beacons?x=1')).toBe('BEACON');
    expect(resourceFromUrl('/api/v1/sites/abc/maps')).toBeNull();
  });
});

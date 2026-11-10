import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AUTH_GATEWAY_PORT, AUTH_STORAGE_PORT } from './iam.ports';
import { AuthHttpGateway } from '../infrastructure/auth-http.gateway';
import { BrowserAuthStorage } from '../infrastructure/browser-auth.storage';
import { environment } from '../../../environments/environment';

const iamAdapters = [
  { provide: AUTH_GATEWAY_PORT, useExisting: AuthHttpGateway },
  { provide: AUTH_STORAGE_PORT, useExisting: BrowserAuthStorage }
];

describe('AuthService verified IAM lifecycle', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const credentials = { email: 'admin@example.com', password: 'Password123' };
  const response = { userId: 'user-1', role: 'CLINIC_ADMIN', clinicId: null, tokenType: 'Bearer',
    accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1', refreshTokenExpiresAt: '2099-01-01T00:00:00Z' };
  const account = { id: 'user-1', role: 'CLINIC_ADMIN', status: 'ACTIVE', email: 'admin@example.com', clinicId: null };
  const url = (path: string) => environment.apiUrl + path;
  const verify = () => {
    const request = http.expectOne(url('/user-accounts/me'));
    expect(request.request.headers.get('Authorization')).toContain('Bearer access-');
    request.flush(account);
  };
  const signIn = () => {
    service.signIn(credentials).subscribe();
    http.expectOne(url('/auth/sign-in')).flush(response);
    verify();
  };

  it('signs a clinic administrator up without opening a session', () => {
    const request = { email: 'a@b.pe', password: 'Rumbo2026', role: 'CLINIC_ADMIN' as const, fullName: 'A B',
      clinicName: 'C', acceptedTerms: true };
    let created: unknown;
    service.signUp(request).subscribe(value => created = value);
    const call = http.expectOne(url('/auth/sign-up'));
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush(account);
    expect(created).toEqual(account);
    expect(service.session()).toBeNull();
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ...iamAdapters] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('is anonymous without credentials and does not call IAM', () => {
    service.validateSession().subscribe(valid => expect(valid).toBe(false));
    expect(service.isAuthenticated()).toBe(false);
    http.expectNone(url('/user-accounts/me'));
  });

  it('waits for /me before granting administrative access', () => {
    service.signIn(credentials).subscribe();
    const request = http.expectOne(url('/auth/sign-in'));
    expect(request.request.body).toEqual(credentials);
    request.flush(response);
    expect(service.isAuthenticated()).toBe(false);
    verify();
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUserId()).toBe(account.id);
  });

  it('rejects a server-verified patient even when local role says administrator', () => {
    let denied = false;
    service.signIn(credentials).subscribe({ error: error => denied = error.status === 403 });
    http.expectOne(url('/auth/sign-in')).flush(response);
    http.expectOne(url('/user-accounts/me')).flush({ ...account, role: 'PATIENT' });
    expect(denied).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('rumbo_auth_session')).toBeNull();
  });

  it('coalesces concurrent guarded navigations but revalidates later navigation', () => {
    signIn();
    service.validateSession().subscribe(valid => expect(valid).toBe(true));
    service.validateSession().subscribe(valid => expect(valid).toBe(true));
    verify();
    service.validateSession().subscribe(valid => expect(valid).toBe(true));
    verify();
  });

  it('invalidates rejected credentials instead of trusting the stored session', () => {
    signIn();
    service.validateSession().subscribe(valid => expect(valid).toBe(false));
    http.expectOne(url('/user-accounts/me')).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(url('/auth/refresh')).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getToken()).toBeNull();
  });

  it('rotates once for concurrent unauthorized requests', () => {
    signIn();
    service.recoverAccessToken('access-1').subscribe(token => expect(token).toBe('access-2'));
    service.recoverAccessToken('access-1').subscribe(token => expect(token).toBe('access-2'));
    const refresh = http.expectOne(url('/auth/refresh'));
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ ...response, accessToken: 'access-2', refreshToken: 'refresh-2' });
    verify();
    expect(service.getToken()).toBe('access-2');
    service.recoverAccessToken('access-1').subscribe(token => expect(token).toBe('access-2'));
    http.expectNone(url('/auth/refresh'));
  });

  it('does not restore a session after logout while refresh was pending', () => {
    signIn();
    let rejected = false;
    service.recoverAccessToken('access-1').subscribe({ error: () => rejected = true });
    const request = http.expectOne(url('/auth/refresh'));
    service.clearSession();
    request.flush({ ...response, accessToken: 'access-2' });
    expect(rejected).toBe(true);
    expect(service.getToken()).toBeNull();
    http.expectNone(url('/user-accounts/me'));
  });

  it('revokes the actual session before confirming logout', () => {
    signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    service.signOut().subscribe();
    const request = http.expectOne(url('/auth/sign-out'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('reports unconfirmed remote logout instead of swallowing network failure', () => {
    signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    let failed = false;
    service.signOut().subscribe({ error: () => failed = true });
    http.expectOne(url('/auth/sign-out')).error(new ProgressEvent('network'));
    expect(failed).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'sign-out-unconfirmed' } });
  });
});

describe('AuthService restored credentials', () => {
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.clear(); });

  it('treats a forged but well-formed saved session as unverified until IAM accepts it', () => {
    localStorage.setItem('rumbo_auth_session', JSON.stringify({ userId: 'forged', role: 'CLINIC_ADMIN',
      accessToken: 'forged-token', refreshToken: 'forged-refresh', accessExpiresAt: Date.now() + 900_000,
      refreshTokenExpiresAt: '2099-01-01T00:00:00Z' }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ...iamAdapters] });
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(false);
    auth.validateSession().subscribe(valid => expect(valid).toBe(false));
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl + '/user-accounts/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl + '/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.getToken()).toBeNull();
  });

  it('refreshes an expired access token before validating the restored account', () => {
    localStorage.setItem('rumbo_auth_session', JSON.stringify({ userId: 'user-1', role: 'CLINIC_ADMIN',
      accessToken: 'old', refreshToken: 'refresh-1', accessExpiresAt: Date.now() - 1,
      refreshTokenExpiresAt: '2099-01-01T00:00:00Z' }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ...iamAdapters] });
    const auth = TestBed.inject(AuthService), http = TestBed.inject(HttpTestingController);
    auth.validateSession().subscribe(valid => expect(valid).toBe(true));
    http.expectOne(environment.apiUrl + '/auth/refresh').flush({ userId: 'user-1', role: 'CLINIC_ADMIN',
      clinicId: null, accessToken: 'new', refreshToken: 'rotated', expiresIn: 900,
      refreshTokenExpiresAt: '2099-01-01T00:00:00Z' });
    const account = { id: 'user-1', role: 'CLINIC_ADMIN', status: 'ACTIVE', clinicId: null };
    http.expectOne(environment.apiUrl + '/user-accounts/me').flush(account);
    expect(auth.isAuthenticated()).toBe(true);
  });
});

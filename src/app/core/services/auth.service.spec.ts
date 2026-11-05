import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthenticatedUserResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let router: Router;

  const mockResponse: AuthenticatedUserResponse = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'CLINIC_ADMIN',
    clinicId: '22222222-2222-4222-8222-222222222222',
    tokenType: 'Bearer',
    accessToken: 'test-jwt-access-token',
    expiresIn: 900,
    refreshToken: 'test-refresh-token',
    refreshTokenExpiresAt: '2026-11-12T19:30:00Z'
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created and initially unauthenticated', () => {
    expect(service).toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getToken()).toBeNull();
  });

  it('should sign in successfully and store session', () => {
    service.signIn({ email: 'admin@clinica.com', password: 'Password123!' }).subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpTesting.expectOne(`${environment.apiUrl}/auth/sign-in`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'admin@clinica.com', password: 'Password123!' });
    req.flush(mockResponse);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getToken()).toBe('test-jwt-access-token');
    expect(service.currentRole()).toBe('CLINIC_ADMIN');
    expect(service.currentUserId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(service.currentClinicId()).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('should sign out, clear session and navigate to /login', () => {
    // Seed authenticated session
    service.signIn({ email: 'admin@clinica.com', password: 'Password123!' }).subscribe();
    httpTesting.expectOne(`${environment.apiUrl}/auth/sign-in`).flush(mockResponse);

    const navigateSpy = vi.spyOn(router, 'navigate');

    service.signOut().subscribe();
    const req = httpTesting.expectOne(`${environment.apiUrl}/auth/sign-out`);
    expect(req.request.method).toBe('POST');
    req.flush(null);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});

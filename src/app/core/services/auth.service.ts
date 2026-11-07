import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthenticatedUserResponse, AuthSession, SignInRequest, SignUpRequest, UserAccountResponse } from '../models/auth.model';

const STORAGE_KEY = 'rumbo_auth_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Bypass the interceptor for IAM to prevent recursive refresh requests.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);
  private readonly sessionSignal = signal<AuthSession | null>(this.readCredentials());
  private readonly verified = signal(false);
  private generation = 0;
  private refreshInFlight?: Observable<string>;
  private validationInFlight?: Observable<boolean>;

  readonly session = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.verified() && this.sessionSignal()?.role === 'CLINIC_ADMIN');
  readonly currentUserId = computed(() => this.isAuthenticated() ? this.sessionSignal()!.userId : null);
  readonly currentRole = computed(() => this.isAuthenticated() ? this.sessionSignal()!.role : null);
  readonly currentClinicId = computed(() => this.isAuthenticated() ? this.sessionSignal()!.clinicId : null);

  /** Registers a clinic administrator. It opens no session: the user signs in afterwards. */
  signUp(request: SignUpRequest): Observable<UserAccountResponse> {
    return this.http.post<UserAccountResponse>(`${environment.apiUrl}/auth/sign-up`, request);
  }

  signIn(credentials: SignInRequest): Observable<AuthenticatedUserResponse> {
    this.clearSession();
    const generation = this.generation;
    return this.http.post<AuthenticatedUserResponse>(`${environment.apiUrl}/auth/sign-in`, credentials).pipe(
      tap(response => { this.requireGeneration(generation); this.acceptCredentials(response); }),
      switchMap(response => this.verifyAccount().pipe(map(() => response))),
      catchError(error => {
        if (generation === this.generation) this.clearSession();
        return throwError(() => error);
      })
    );
  }

  /** Local credentials never grant access: every guarded navigation checks IAM. */
  validateSession(): Observable<boolean> {
    if (!this.sessionSignal()) return of(false);
    if (!this.validationInFlight) {
      const generation = this.generation;
      const current = this.sessionSignal()!;
      const verification = this.refreshInFlight || current.accessExpiresAt <= Date.now() + 5_000
        ? this.refresh()
        : this.verifyAccount().pipe(catchError(error => {
            if (error.status === 401 && generation === this.generation) return this.recoverAccessToken(current.accessToken);
            return throwError(() => error);
          }));
      this.validationInFlight = verification.pipe(
        map(() => generation === this.generation),
        catchError(() => {
          if (generation === this.generation) this.clearSession();
          return of(false);
        }),
        finalize(() => this.validationInFlight = undefined),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.validationInFlight;
  }

  getToken(): string | null { return this.sessionSignal()?.accessToken ?? null; }

  getValidAccessToken(): Observable<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const session = this.sessionSignal();
    if (!session) return of(null);
    return session.accessExpiresAt > Date.now() + 5_000 ? of(session.accessToken) : this.refresh();
  }

  recoverAccessToken(failedToken: string | null): Observable<string> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const current = this.sessionSignal();
    if (current && current.accessToken !== failedToken && current.accessExpiresAt > Date.now()) {
      return of(current.accessToken);
    }
    return this.refresh();
  }

  signOut(): Observable<void> {
    return this.getValidAccessToken().pipe(
      switchMap(token => token
        ? this.http.post<void>(`${environment.apiUrl}/auth/sign-out`, {}, { headers: { Authorization: `Bearer ${token}` } })
        : of(undefined)),
      tap(() => { this.clearSession(); void this.router.navigate(['/login']); }),
      catchError(error => {
        this.clearSession();
        void this.router.navigate(['/login'], { queryParams: { reason: 'sign-out-unconfirmed' } });
        return throwError(() => error);
      })
    );
  }

  expireSession(): void {
    this.clearSession();
    void this.router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
  }

  clearSession(): void {
    this.generation++;
    this.verified.set(false);
    this.sessionSignal.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }

  private refresh(): Observable<string> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const session = this.sessionSignal();
    if (!session || Date.parse(session.refreshTokenExpiresAt) <= Date.now()) {
      this.clearSession();
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    }
    const generation = this.generation;
    this.refreshInFlight = this.http.post<AuthenticatedUserResponse>(`${environment.apiUrl}/auth/refresh`, {
      refreshToken: session.refreshToken
    }).pipe(
      tap(response => { this.requireGeneration(generation); this.acceptCredentials(response); }),
      switchMap(() => this.verifyAccount()), map(() => this.sessionSignal()!.accessToken),
      catchError(error => {
        if (generation === this.generation) this.clearSession();
        return throwError(() => error);
      }),
      finalize(() => this.refreshInFlight = undefined),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.refreshInFlight;
  }

  private verifyAccount(): Observable<UserAccountResponse> {
    const generation = this.generation;
    const session = this.sessionSignal();
    if (!session) return throwError(() => new HttpErrorResponse({ status: 401 }));
    return this.http.get<UserAccountResponse>(`${environment.apiUrl}/user-accounts/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    }).pipe(tap(account => {
      this.requireGeneration(generation);
      if (account.id !== session.userId || account.role !== 'CLINIC_ADMIN' || account.status !== 'ACTIVE') {
        throw new HttpErrorResponse({ status: 403, error: { code: 'ADMIN_ACCESS_REQUIRED' } });
      }
      this.persist({ ...this.sessionSignal()!, role: account.role, clinicId: account.clinicId });
      this.verified.set(true);
    }));
  }

  private acceptCredentials(response: AuthenticatedUserResponse): void {
    if (!response.accessToken || !response.refreshToken || !response.userId ||
        !Number.isFinite(response.expiresIn) || response.expiresIn <= 0 ||
        !(Date.parse(response.refreshTokenExpiresAt) > Date.now())) {
      throw new HttpErrorResponse({ status: 401, error: { code: 'INVALID_SESSION_RESPONSE' } });
    }
    this.verified.set(false);
    this.persist({ userId: response.userId, role: response.role, clinicId: response.clinicId,
      accessToken: response.accessToken, refreshToken: response.refreshToken,
      accessExpiresAt: Date.now() + response.expiresIn * 1000, refreshTokenExpiresAt: response.refreshTokenExpiresAt });
  }

  private persist(session: AuthSession): void {
    this.sessionSignal.set(session);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* Keep an in-memory session. */ }
  }

  private readCredentials(): AuthSession | null {
    try {
      const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (session && typeof session.userId === 'string' && typeof session.accessToken === 'string' &&
          typeof session.refreshToken === 'string' && Number.isFinite(session.accessExpiresAt) &&
          Date.parse(session.refreshTokenExpiresAt) > Date.now()) return session;
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* Malformed or legacy storage never authenticates a user. */ }
    return null;
  }

  private requireGeneration(generation: number): void {
    if (generation !== this.generation) throw new HttpErrorResponse({ status: 401 });
  }
}

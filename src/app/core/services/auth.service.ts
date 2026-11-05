import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthenticatedUserResponse, AuthSession, SignInRequest } from '../models/auth.model';

const STORAGE_KEY = 'rumbo_auth_session';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = environment.apiUrl;

  private readonly sessionSignal = signal<AuthSession | null>(this.loadSessionFromStorage());

  readonly session = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.sessionSignal());
  readonly currentUserId = computed(() => this.sessionSignal()?.userId ?? null);
  readonly currentRole = computed(() => this.sessionSignal()?.role ?? null);
  readonly currentClinicId = computed(() => this.sessionSignal()?.clinicId ?? null);

  signIn(credentials: SignInRequest): Observable<AuthenticatedUserResponse> {
    return this.http.post<AuthenticatedUserResponse>(`${this.apiUrl}/auth/sign-in`, credentials).pipe(
      tap((response) => {
        const session: AuthSession = {
          userId: response.userId,
          role: response.role,
          clinicId: response.clinicId,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken
        };
        this.saveSession(session);
      })
    );
  }

  signOut(): Observable<void> {
    const token = this.getToken();
    const clearAndRedirect = () => {
      this.clearSession();
      this.router.navigate(['/login']);
    };

    if (!token) {
      clearAndRedirect();
      return of(undefined);
    }

    return this.http.post<void>(`${this.apiUrl}/auth/sign-out`, {}).pipe(
      tap(() => clearAndRedirect()),
      catchError(() => {
        clearAndRedirect();
        return of(undefined);
      })
    );
  }

  getToken(): string | null {
    return this.sessionSignal()?.accessToken ?? null;
  }

  clearSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors in restricted contexts
    }
    this.sessionSignal.set(null);
  }

  private saveSession(session: AuthSession): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage quota or disabled
    }
    this.sessionSignal.set(session);
  }

  private loadSessionFromStorage(): AuthSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data) as AuthSession;
    } catch {
      return null;
    }
  }
}

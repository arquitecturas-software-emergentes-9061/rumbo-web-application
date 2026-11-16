import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSession, AuthenticatedUserResponse, SignInRequest, SignUpRequest, UserAccountResponse } from '../domain/model/auth.model';

export interface AuthPort {
  readonly session: Signal<AuthSession | null>;
  readonly isAuthenticated: Signal<boolean>;
  readonly currentUserId: Signal<string | null>;
  readonly currentRole: Signal<string | null>;
  readonly currentClinicId: Signal<string | null>;
  signUp(request: SignUpRequest): Observable<UserAccountResponse>;
  signIn(credentials: SignInRequest): Observable<AuthenticatedUserResponse>;
  validateSession(): Observable<boolean>;
  getToken(): string | null;
  getValidAccessToken(): Observable<string | null>;
  recoverAccessToken(failedToken: string | null): Observable<string>;
  signOut(): Observable<void>;
  expireSession(): void;
  clearSession(): void;
}
export const AUTH_PORT = new InjectionToken<AuthPort>('IAM authenticated session');

export interface AuthGatewayPort {
  signUp(request: SignUpRequest): Observable<UserAccountResponse>;
  signIn(request: SignInRequest): Observable<AuthenticatedUserResponse>;
  refresh(refreshToken: string): Observable<AuthenticatedUserResponse>;
  account(accessToken: string): Observable<UserAccountResponse>;
  signOut(accessToken: string): Observable<void>;
}
export const AUTH_GATEWAY_PORT = new InjectionToken<AuthGatewayPort>('IAM HTTP gateway');

export interface AuthStoragePort {
  read(): string | null;
  write(value: string): void;
  remove(): void;
}
export const AUTH_STORAGE_PORT = new InjectionToken<AuthStoragePort>('IAM session storage');

export interface PasswordRecoveryPort {
  requestPasswordReset(email: string): Observable<void>;
  confirmPasswordReset(resetToken: string, newPassword: string): Observable<void>;
}
export const PASSWORD_RECOVERY_PORT = new InjectionToken<PasswordRecoveryPort>('IAM password recovery');

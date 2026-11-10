import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthenticatedUserResponse, SignInRequest, SignUpRequest, UserAccountResponse } from '../domain/model/auth.model';
import { AuthGatewayPort } from '../application/iam.ports';

@Injectable({ providedIn: 'root' })
export class AuthHttpGateway implements AuthGatewayPort {
  // IAM requests bypass the auth interceptor to avoid recursive refreshes.
  private readonly http = new HttpClient(inject(HttpBackend));

  signUp(request: SignUpRequest): Observable<UserAccountResponse> {
    return this.http.post<UserAccountResponse>(`${environment.apiUrl}/auth/sign-up`, request);
  }

  signIn(request: SignInRequest): Observable<AuthenticatedUserResponse> {
    return this.http.post<AuthenticatedUserResponse>(`${environment.apiUrl}/auth/sign-in`, request);
  }

  refresh(refreshToken: string): Observable<AuthenticatedUserResponse> {
    return this.http.post<AuthenticatedUserResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken });
  }

  account(accessToken: string): Observable<UserAccountResponse> {
    return this.http.get<UserAccountResponse>(`${environment.apiUrl}/user-accounts/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }

  signOut(accessToken: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/auth/sign-out`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }
}

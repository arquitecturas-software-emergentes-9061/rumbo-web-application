import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PasswordResetConfirmationRequest, PasswordResetRequest } from '../domain/model/password-recovery.model';
import { PasswordRecoveryPort } from '../application/iam.ports';

@Injectable({
  providedIn: 'root'
})
export class PasswordRecoveryService implements PasswordRecoveryPort {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/password-recovery`;

  /**
   * Sends a password reset request.
   * Backend returns 202 Accepted unconditionally to preserve privacy (OWASP compliance).
   */
  requestPasswordReset(email: string): Observable<void> {
    const payload: PasswordResetRequest = { email };
    return this.http.post<void>(`${this.baseUrl}/requests`, payload);
  }

  /**
   * Confirms a password reset with the one-time link token and the new password.
   * Backend returns 204 No Content on success or 400 Bad Request with ProblemDetail if token is invalid/expired.
   */
  confirmPasswordReset(resetToken: string, newPassword: string): Observable<void> {
    const payload: PasswordResetConfirmationRequest = { resetToken, newPassword };
    return this.http.post<void>(`${this.baseUrl}/confirmations`, payload);
  }
}

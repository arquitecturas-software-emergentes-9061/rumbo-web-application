import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PasswordRecoveryService } from './password-recovery.service';
import { environment } from '../../../environments/environment';

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PasswordRecoveryService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(PasswordRecoveryService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send a password reset request with email', () => {
    const testEmail = 'admin@clinica.com';
    let success = false;

    service.requestPasswordReset(testEmail).subscribe({
      next: () => {
        success = true;
      }
    });

    const req = httpTesting.expectOne(`${environment.apiUrl}/password-recovery/requests`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: testEmail });
    req.flush(null, { status: 202, statusText: 'Accepted' });

    expect(success).toBe(true);
  });

  it('should confirm password reset with token and new password', () => {
    const testToken = 'valid-reset-token-uuid';
    const testPassword = 'NewValidPassword123';
    let success = false;

    service.confirmPasswordReset(testToken, testPassword).subscribe({
      next: () => {
        success = true;
      }
    });

    const req = httpTesting.expectOne(`${environment.apiUrl}/password-recovery/confirmations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ resetToken: testToken, newPassword: testPassword });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(success).toBe(true);
  });

  it('should propagate error when reset token is invalid or expired', () => {
    const testToken = 'expired-token';
    const testPassword = 'NewValidPassword123';
    let errorCaught = false;

    service.confirmPasswordReset(testToken, testPassword).subscribe({
      error: (error) => {
        errorCaught = true;
        expect(error.status).toBe(400);
        expect(error.error.code).toBe('INVALID_PASSWORD_RESET_TOKEN');
      }
    });

    const req = httpTesting.expectOne(`${environment.apiUrl}/password-recovery/confirmations`);
    req.flush(
      { code: 'INVALID_PASSWORD_RESET_TOKEN', detail: 'Token has expired' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(errorCaught).toBe(true);
  });
});

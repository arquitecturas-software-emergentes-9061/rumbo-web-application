import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PasswordResetConfirmComponent } from './password-reset-confirm.component';
import { PASSWORD_RECOVERY_PORT } from '../../../application/iam.ports';

describe('PasswordResetConfirmComponent', () => {
  let component: PasswordResetConfirmComponent;
  let fixture: ComponentFixture<PasswordResetConfirmComponent>;
  let recoveryServiceSpy: { confirmPasswordReset: ReturnType<typeof vi.fn> };

  const createComponentWithToken = async (tokenValue: string | null) => {
    recoveryServiceSpy = { confirmPasswordReset: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [PasswordResetConfirmComponent],
      providers: [
        { provide: PASSWORD_RECOVERY_PORT, useValue: recoveryServiceSpy },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'token' ? tokenValue : null)
              }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordResetConfirmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should detect missing token and show invalid token state', async () => {
    await createComponentWithToken(null);

    expect(component.isTokenInvalid()).toBe(true);
    expect(component.resetToken()).toBeNull();
    expect(component.errorMessage()).toContain('token de recuperación válido');
  });

  it('should accept valid token from route query params', async () => {
    await createComponentWithToken('sample-valid-token-123');

    expect(component.isTokenInvalid()).toBe(false);
    expect(component.resetToken()).toBe('sample-valid-token-123');
  });

  it('should validate password policy (min 8 chars, uppercase, number)', async () => {
    await createComponentWithToken('sample-valid-token-123');

    // Too short and no number/uppercase
    component.resetForm.get('newPassword')?.setValue('short');
    expect(component.hasMinLength).toBe(false);
    expect(component.hasUppercase).toBe(false);
    expect(component.hasNumber).toBe(false);

    // Has length and uppercase, but no number
    component.resetForm.get('newPassword')?.setValue('ValidPassword');
    expect(component.hasMinLength).toBe(true);
    expect(component.hasUppercase).toBe(true);
    expect(component.hasNumber).toBe(false);

    // Satisfies all policy requirements
    component.resetForm.get('newPassword')?.setValue('ValidPassword2026');
    expect(component.hasMinLength).toBe(true);
    expect(component.hasUppercase).toBe(true);
    expect(component.hasNumber).toBe(true);
  });

  it('should validate password match', async () => {
    await createComponentWithToken('sample-valid-token-123');

    component.resetForm.get('newPassword')?.setValue('ValidPassword2026');
    component.resetForm.get('confirmPassword')?.setValue('DifferentPassword2026');

    expect(component.passwordsMatch).toBe(false);
    expect(component.resetForm.hasError('passwordMismatch')).toBe(true);

    component.resetForm.get('confirmPassword')?.setValue('ValidPassword2026');
    expect(component.passwordsMatch).toBe(true);
    expect(component.resetForm.valid).toBe(true);
  });

  it('should toggle password visibility flags', async () => {
    await createComponentWithToken('sample-valid-token-123');

    expect(component.showPassword()).toBe(false);
    component.togglePassword();
    expect(component.showPassword()).toBe(true);

    expect(component.showConfirmPassword()).toBe(false);
    component.toggleConfirmPassword();
    expect(component.showConfirmPassword()).toBe(true);
  });

  it('unblocks submission when only the first password is corrected to match confirmation', async () => {
    await createComponentWithToken('test-token');
    component.resetForm.setValue({ newPassword: 'Password123', confirmPassword: 'Otherpass123' });
    expect(component.resetForm.invalid).toBe(true);
    component.resetForm.get('newPassword')!.setValue('Otherpass123');
    fixture.detectChanges();
    expect(component.resetForm.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    recoveryServiceSpy.confirmPasswordReset.mockReturnValue(of(undefined));
    component.onSubmit();
    expect(recoveryServiceSpy.confirmPasswordReset).toHaveBeenCalledWith('test-token', 'Otherpass123');
  });

  it('does not mark a weak password response as an expired token', async () => {
    await createComponentWithToken('test-token');
    recoveryServiceSpy.confirmPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { code: 'WEAK_PASSWORD', detail: 'Password policy' }
    })));
    component.resetForm.setValue({ newPassword: 'Password123', confirmPassword: 'Password123' });
    component.onSubmit();
    expect(component.isTokenInvalid()).toBe(false);
    expect(component.errorMessage()).toContain('requisitos de seguridad');
  });

  it('should submit new password and transition to success state on 204 response', async () => {
    await createComponentWithToken('sample-valid-token-123');
    recoveryServiceSpy.confirmPasswordReset.mockReturnValue(of(undefined));

    component.resetForm.setValue({
      newPassword: 'NewValidPassword2026',
      confirmPassword: 'NewValidPassword2026'
    });

    component.onSubmit();

    expect(recoveryServiceSpy.confirmPasswordReset).toHaveBeenCalledWith(
      'sample-valid-token-123',
      'NewValidPassword2026'
    );
    expect(component.isSuccess()).toBe(true);
    expect(component.isLoading()).toBe(false);
  });

  it('should handle INVALID_PASSWORD_RESET_TOKEN error and show expired link state', async () => {
    await createComponentWithToken('expired-token-123');

    const errorResponse = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      error: {
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        detail: 'The password reset link is invalid or has expired'
      }
    });

    recoveryServiceSpy.confirmPasswordReset.mockReturnValue(throwError(() => errorResponse));

    component.resetForm.setValue({
      newPassword: 'NewValidPassword2026',
      confirmPassword: 'NewValidPassword2026'
    });

    component.onSubmit();

    expect(component.isSuccess()).toBe(false);
    expect(component.isTokenInvalid()).toBe(true);
    expect(component.errorMessage()).toContain('inválido o ha expirado');
    expect(component.isLoading()).toBe(false);
  });
});

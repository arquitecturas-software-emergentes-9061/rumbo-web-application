import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PasswordRecoveryService } from '../../../../core/services/password-recovery.service';
import { ProblemDetail } from '../../../../core/models/password-recovery.model';

export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('newPassword');
  const confirmPassword = control.get('confirmPassword');

  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ passwordMismatch: true });
    return { passwordMismatch: true };
  }
  return null;
};

@Component({
  selector: 'app-password-reset-confirm',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './password-reset-confirm.component.html',
  styleUrl: './password-reset-confirm.component.css'
})
export class PasswordResetConfirmComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly recoveryService = inject(PasswordRecoveryService);

  readonly resetToken = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isSuccess = signal(false);
  readonly isTokenInvalid = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly resetForm: FormGroup = this.fb.group(
    {
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(/^(?=.*[A-Z])(?=.*\d).*$/)
        ]
      ],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordMatchValidator }
  );

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token || token.trim() === '') {
      this.isTokenInvalid.set(true);
      this.errorMessage.set('El enlace no contiene un token de recuperación válido.');
    } else {
      this.resetToken.set(token.trim());
    }
  }

  togglePassword(): void {
    this.showPassword.update((val) => !val);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((val) => !val);
  }

  get newPasswordControl() {
    return this.resetForm.get('newPassword');
  }

  get confirmPasswordControl() {
    return this.resetForm.get('confirmPassword');
  }

  // Security policy checks for interactive UI list
  get hasMinLength(): boolean {
    const val = this.newPasswordControl?.value || '';
    return val.length >= 8 && val.length <= 72;
  }

  get hasUppercase(): boolean {
    const val = this.newPasswordControl?.value || '';
    return /[A-Z]/.test(val);
  }

  get hasNumber(): boolean {
    const val = this.newPasswordControl?.value || '';
    return /\d/.test(val);
  }

  get passwordsMatch(): boolean {
    const p1 = this.newPasswordControl?.value;
    const p2 = this.confirmPasswordControl?.value;
    return !!p1 && p1 === p2;
  }

  onSubmit(): void {
    const token = this.resetToken();
    if (!token) {
      this.isTokenInvalid.set(true);
      return;
    }

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const newPassword = this.resetForm.value.newPassword;

    this.recoveryService.confirmPasswordReset(token, newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isSuccess.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        this.handleError(error);
      }
    });
  }

  private handleError(error: HttpErrorResponse): void {
    if (error.status === 0) {
      this.errorMessage.set('No se pudo conectar con el servidor. Verifique su conexión.');
      return;
    }

    const problem: ProblemDetail = error.error;
    if (problem) {
      if (problem.code === 'INVALID_PASSWORD_RESET_TOKEN' || error.status === 400) {
        this.isTokenInvalid.set(true);
        this.errorMessage.set('El enlace de recuperación es inválido o ha expirado. Por favor solicite uno nuevo.');
        return;
      }
      if (problem.code === 'WEAK_PASSWORD') {
        this.errorMessage.set('La nueva contraseña no cumple con los requisitos de seguridad requeridos.');
        return;
      }
      if (problem.code === 'PASSWORD_RECOVERY_UNAVAILABLE' || error.status === 503) {
        this.errorMessage.set('El servicio de recuperación no se encuentra disponible momentáneamente. Intente en unos minutos.');
        return;
      }
      if (problem.detail) {
        this.errorMessage.set(problem.detail);
        return;
      }
    }

    this.errorMessage.set('Ocurrió un error al restablecer la contraseña. Inténtelo más tarde.');
  }
}

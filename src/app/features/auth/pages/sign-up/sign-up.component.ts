import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthLayoutComponent } from '../../../../shared/auth-layout/auth-layout.component';
import { AuthService } from '../../../../core/services/auth.service';
import { ProblemDetail } from '../../../../core/models/auth.model';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, AuthLayoutComponent],
  templateUrl: './sign-up.component.html'
})
export class SignUpComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly signUpForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [
      Validators.required,
      Validators.minLength(PASSWORD_MIN),
      Validators.maxLength(PASSWORD_MAX),
      Validators.pattern(/^(?=.*[A-Z])(?=.*\d).+$/)
    ]],
    clinicName: ['', [Validators.required, Validators.maxLength(120)]],
    acceptedTerms: [false, [Validators.requiredTrue]]
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly emailTaken = signal(false);
  readonly showPassword = signal(false);

  get fullNameControl() { return this.signUpForm.get('fullName'); }
  get emailControl() { return this.signUpForm.get('email'); }
  get passwordControl() { return this.signUpForm.get('password'); }
  get clinicNameControl() { return this.signUpForm.get('clinicName'); }
  get termsControl() { return this.signUpForm.get('acceptedTerms'); }

  get hasMinLength(): boolean {
    const value: string = this.passwordControl?.value || '';
    return value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;
  }
  get hasUppercase(): boolean { return /[A-Z]/.test(this.passwordControl?.value || ''); }
  get hasNumber(): boolean { return /\d/.test(this.passwordControl?.value || ''); }

  togglePasswordVisibility(): void {
    this.showPassword.update(value => !value);
  }

  onSubmit(): void {
    if (this.isLoading()) return;
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.emailTaken.set(false);

    const { fullName, email, password, clinicName, acceptedTerms } = this.signUpForm.value;
    this.authService.signUp({
      role: 'CLINIC_ADMIN',
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      clinicName: clinicName.trim(),
      acceptedTerms
    }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/login'], { queryParams: { reason: 'account-created' } });
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        const problem = error.error as ProblemDetail | undefined;
        if (error.status === 409 || problem?.code === 'EMAIL_ALREADY_REGISTERED') {
          this.emailTaken.set(true);
          this.emailControl?.markAsTouched();
          return;
        }
        this.errorMessage.set(this.resolveErrorMessage(error));
      }
    });
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifique su conexión o intente más tarde.';
    }
    const problem = error.error as ProblemDetail | undefined;
    if (problem?.code === 'WEAK_PASSWORD') {
      return 'La contraseña no cumple los requisitos de seguridad.';
    }
    if (problem?.code === 'VALIDATION_FAILED' && problem.errors) {
      const fields = Object.keys(problem.errors).join(', ');
      return `Revise los campos del formulario: ${fields}.`;
    }
    return problem?.detail || 'Ocurrió un error al crear la cuenta. Inténtelo nuevamente.';
  }
}

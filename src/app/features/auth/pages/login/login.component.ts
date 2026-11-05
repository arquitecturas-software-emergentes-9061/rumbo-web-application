import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/services/auth.service';
import { ProblemDetail } from '../../../../core/models/auth.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  get sessionNotice(): string | null {
    const reason = this.route.snapshot.queryParams['reason'];
    if (reason === 'session-expired') return 'Tu sesión venció. Inicia sesión de nuevo.';
    if (reason === 'sign-out-unconfirmed') return 'Cerraste la sesión en este navegador. El servidor no confirmó la revocación.';
    return null;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((val) => !val);
  }

  onSubmit(): void {
    if (this.isLoading()) return;
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    this.authService.signIn({ email, password }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        const requested = this.route.snapshot.queryParams['returnUrl'];
        const returnUrl = typeof requested === 'string' && /^\/(admin|planning)(\/|\?|$)/.test(requested)
          ? requested : '/admin';
        this.router.navigateByUrl(returnUrl);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        this.errorMessage.set(this.resolveErrorMessage(error));
      }
    });
  }

  get emailControl() {
    return this.loginForm.get('email');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifique su conexión o intente más tarde.';
    }

    const problem: ProblemDetail = error.error;
    if (problem) {
      if (problem.code === 'ADMIN_ACCESS_REQUIRED') {
        return 'Esta cuenta no tiene acceso administrativo a Rumbo.';
      }
      if (problem.code === 'INVALID_CREDENTIALS' || error.status === 401) {
        return 'Credenciales inválidas. Verifique su correo electrónico y contraseña.';
      }
      if (problem.code === 'ACCOUNT_LOCKED' || error.status === 423) {
        return 'La cuenta se encuentra bloqueada temporalmente por múltiples intentos fallidos.';
      }
      if (problem.code === 'ACCOUNT_DISABLED' || error.status === 403) {
        return 'Esta cuenta de administrador ha sido deshabilitada. Contacte con soporte.';
      }
      if (problem.detail) {
        return problem.detail;
      }
    }

    return 'Ocurrió un error al iniciar sesión. Inténtelo nuevamente.';
  }
}

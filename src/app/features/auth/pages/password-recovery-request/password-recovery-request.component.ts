import { AuthLayoutComponent } from '../../../../shared/auth-layout/auth-layout.component';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PasswordRecoveryService } from '../../../../core/services/password-recovery.service';

@Component({
  selector: 'app-password-recovery-request',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, AuthLayoutComponent],
  templateUrl: './password-recovery-request.component.html'
})
export class PasswordRecoveryRequestComponent {
  private readonly fb = inject(FormBuilder);
  private readonly recoveryService = inject(PasswordRecoveryService);

  readonly requestForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly isLoading = signal(false);
  readonly isSubmitted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submittedEmail = signal<string>('');

  get emailControl() {
    return this.requestForm.get('email');
  }

  onSubmit(): void {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const email = this.requestForm.value.email.trim();
    this.submittedEmail.set(email);

    this.recoveryService.requestPasswordReset(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isSubmitted.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (error.status === 0) {
          this.errorMessage.set('No se pudo conectar con el servidor. Verifique su conexión.');
        } else {
          // Even on non-critical errors, we display neutral safe feedback unless server is completely unavailable
          this.errorMessage.set('Ocurrió un error al procesar la solicitud. Inténtelo más tarde.');
        }
      }
    });
  }

  retry(): void {
    this.isSubmitted.set(false);
    this.requestForm.reset();
    this.errorMessage.set(null);
  }
}

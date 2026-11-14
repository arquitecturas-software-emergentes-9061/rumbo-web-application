import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MySubscription } from '../../../domain/model/my-subscription.model';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';

@Component({
  selector: 'app-my-subscription',
  imports: [DatePipe, DecimalPipe, RouterLink, AdminShellComponent],
  templateUrl: './my-subscription.component.html',
  styleUrl: './my-subscription.component.css'
})
export class MySubscriptionComponent implements OnInit {
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly destroyRef = inject(DestroyRef);
  readonly subscription = signal<MySubscription | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getMySubscription().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: subscription => {
        this.subscription.set(subscription);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(error.status === 0 ? 'No hay conexión con la API. Intenta de nuevo.'
          : error.status === 403 ? 'Tu cuenta no tiene permiso para esta operación.'
          : 'No se pudo cargar tu suscripción.');
      }
    });
  }
}

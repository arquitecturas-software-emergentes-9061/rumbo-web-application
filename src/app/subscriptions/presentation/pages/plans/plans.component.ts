import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';

@Component({
  selector: 'app-plans',
  imports: [RouterLink, AdminShellComponent],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.css'
})
export class PlansComponent implements OnInit {
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly error = signal<string | null>(null);
  readonly plans = signal<SubscriptionPlan[]>([]);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    this.service.loadPlans().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: plans => this.plans.set(plans),
      error: (error: HttpErrorResponse) => {
        this.loadFailed.set(true);
        this.error.set(error.status === 0
          ? 'No hay conexión con la API. Intenta de nuevo.'
          : error.status === 403
            ? 'Tu cuenta no tiene permiso para esta operación.'
            : 'No se pudieron cargar los planes.');
      }
    });
  }
}

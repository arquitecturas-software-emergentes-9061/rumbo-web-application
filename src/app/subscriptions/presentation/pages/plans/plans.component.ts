import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { PlanQuota, SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { MySubscription } from '../../../domain/model/my-subscription.model';

@Component({
  selector: 'app-plans',
  imports: [RouterLink, AdminShellComponent],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.css'
})
export class PlansComponent implements OnInit {
  private readonly auth = inject(AUTH_PORT);
  readonly subscription = signal<MySubscription | null>(null);
  readonly subscriptionLoading = signal(false);
  readonly subscriptionFailed = signal(false);

  quotaText(quota: PlanQuota): string {
    if (Object.values(quota).every(value => value === null)) return 'Sedes, pisos y balizas ilimitados';
    return [
      quota.sites === null ? 'Sedes ilimitadas' : quota.sites + (quota.sites === 1 ? ' sede' : ' sedes'),
      quota.floors === null ? 'Pisos ilimitados' : quota.floors + (quota.floors === 1 ? ' piso' : ' pisos'),
      quota.beacons === null ? 'Balizas ilimitadas' : quota.beacons + (quota.beacons === 1 ? ' baliza' : ' balizas')
    ].join(' · ');
  }

  blocked(plan: SubscriptionPlan): boolean {
    const subscription = this.subscription();
    const current = this.plans().findIndex(item => item.code === subscription?.plan.code);
    return !!subscription && this.plans().indexOf(plan) < current &&
      (['sites', 'floors', 'beacons'] as const).some(key =>
        plan.quota[key] !== null && subscription.usage[key].used > plan.quota[key]!);
  }

  current(plan: SubscriptionPlan): boolean {
    return this.subscription()?.plan.code === plan.code && this.subscription()?.status === 'ACTIVE';
  }

  action(plan: SubscriptionPlan): string {
    const subscription = this.subscription();
    const current = this.plans().findIndex(item => item.code === subscription?.plan.code);
    if (!subscription || current < 0) return 'Elegir plan';
    if (subscription.plan.code === plan.code) return subscription.status === 'ACTIVE' ? 'Plan actual' : 'Renovar plan ' + plan.name;
    return this.plans().indexOf(plan) > current ? 'Mejorar plan' : 'Cambiar a ' + plan.name;
  }
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly error = signal<string | null>(null);
  readonly plans = signal<SubscriptionPlan[]>([]);
  ngOnInit(): void { this.reload(); }

  reload(): void {
    if (this.auth.isAuthenticated()) {
      this.subscriptionLoading.set(true);
      this.subscriptionFailed.set(false);
      this.service.getMySubscription().pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.subscriptionLoading.set(false))
      ).subscribe({
        next: subscription => this.subscription.set(subscription),
        error: () => this.subscriptionFailed.set(true)
      });
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    this.service.loadPlans().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: plans => {
        this.plans.set(plans);
      },
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

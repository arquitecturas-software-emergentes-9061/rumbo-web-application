import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { BROWSER_NAVIGATION, SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';

@Component({
  selector: 'app-plans',
  imports: [RouterLink, AdminShellComponent],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.css'
})
export class PlansComponent implements OnInit {
  private readonly browserNavigation = inject(BROWSER_NAVIGATION);
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private catalogLoaded = false;

  readonly checkingOut = signal(false);
  readonly checkoutError = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly error = signal<string | null>(null);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly selectedPlan = signal<SubscriptionPlan | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.catalogLoaded) this.restoreSelection();
    });
    this.reload();
  }

  selectPlan(plan: SubscriptionPlan): void {
    if (this.checkingOut() || plan.purchaseMode !== 'CHECKOUT') return;
    this.checkoutError.set(null);
    this.selectedPlan.set(plan);
    this.updatePlanQuery(plan.code);
  }

  clearSelection(): void {
    if (this.checkingOut()) return;
    this.checkoutError.set(null);
    this.selectedPlan.set(null);
    this.updatePlanQuery(null);
  }

  checkout(): void {
    const plan = this.selectedPlan();
    if (this.checkingOut() || !plan || plan.purchaseMode !== 'CHECKOUT' ||
      (plan.code !== 'BASIC' && plan.code !== 'PROFESSIONAL')) return;
    this.checkingOut.set(true);
    this.checkoutError.set(null);
    this.service.createCheckoutSession(plan.code).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.checkingOut.set(false))
    ).subscribe({
      next: session => {
        try {
          const url = new URL(session.checkoutUrl);
          if (!session.checkoutUrl.startsWith('https://checkout.stripe.com/') ||
            url.origin !== 'https://checkout.stripe.com' || url.username || url.password) {
            this.checkoutError.set('No se pudo iniciar el pago.');
            return;
          }
          this.browserNavigation.assign(session.checkoutUrl);
        } catch {
          this.checkoutError.set('No se pudo iniciar el pago.');
        }
      },
      error: (error: HttpErrorResponse) => {
        const messages: Record<string, string> = {
          '409:PLAN_REQUIRES_SALES_CONTACT': 'Este plan requiere contactar a ventas.',
          '404:PLAN_NOT_FOUND': 'El plan ya no está disponible.',
          '503:PAYMENTS_UNAVAILABLE': 'Los pagos no están disponibles por ahora. Intenta más tarde.',
          '502:PAYMENT_PROVIDER_ERROR': 'No se pudo iniciar el pago con Stripe. Intenta de nuevo.'
        };
        this.checkoutError.set(error.status === 0
          ? 'No hay conexión con la API. Intenta de nuevo.'
          : error.status === 403
            ? 'Tu cuenta no tiene permiso para esta operación.'
            : messages[`${error.status}:${error.error?.code}`] ?? 'No se pudo iniciar el pago.');
      }
    });
  }

  private restoreSelection(): void {
    const code = this.route.snapshot.queryParamMap.get('plan');
    const plan = this.plans().find(plan => plan.code === code && plan.purchaseMode === 'CHECKOUT');
    this.selectedPlan.set(plan ?? null);
    if (code !== null && !plan) this.updatePlanQuery(null);
  }

  private updatePlanQuery(plan: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { plan },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  reload(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    this.service.loadPlans().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: plans => {
        this.plans.set(plans);
        this.catalogLoaded = true;
        this.restoreSelection();
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

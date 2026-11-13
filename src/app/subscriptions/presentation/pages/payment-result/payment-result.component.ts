import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PaymentOrder } from '../../../domain/model/payment-order.model';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';

@Component({
  selector: 'app-payment-result',
  imports: [RouterLink, AdminShellComponent],
  templateUrl: './payment-result.component.html',
  styleUrl: './payment-result.component.css'
})
export class PaymentResultComponent implements OnInit {
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private orderId = '';
  private attempts = 0;
  readonly order = signal<PaymentOrder | null>(null);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly cancelled = signal(false);
  readonly loading = signal(false);
  readonly exhausted = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly planName = computed(() => this.plans().find(plan => plan.code === this.order()?.planCode)?.name
    ?? this.order()?.planCode ?? '');

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stop());
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.stop();
      this.order.set(null);
      this.error.set(null);
      this.loading.set(false);
      this.exhausted.set(false);
      this.cancelled.set(params.get('status') === 'cancelled');
      this.orderId = params.get('orderId') ?? '';
      this.notFound.set(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.orderId));
      if (this.notFound()) return;
      this.retry();
      this.service.loadPlans().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: plans => this.plans.set(plans), error: () => this.plans.set([])
      });
    });
  }

  retry(): void {
    if (this.notFound()) return;
    this.stop();
    this.attempts = 0;
    this.error.set(null);
    this.exhausted.set(false);
    this.query();
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.request?.unsubscribe();
  }

  private query(): void {
    this.loading.set(true);
    this.attempts++;
    this.request = this.service.getPaymentOrder(this.orderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => {
        this.order.set(order);
        this.loading.set(false);
        if (order.status === 'PENDING' && !this.cancelled()) {
          if (this.attempts < 5) this.timer = setTimeout(() => this.query(), 2000);
          else this.exhausted.set(true);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.notFound.set(error.status === 404);
        this.error.set(error.status === 404 ? 'No encontramos la orden de pago.'
          : error.status === 0 ? 'No hay conexión con la API. Intenta de nuevo.'
          : error.status === 403 ? 'Tu cuenta no tiene permiso para esta operación.'
          : 'No se pudo consultar el pago.');
      }
    });
  }
}

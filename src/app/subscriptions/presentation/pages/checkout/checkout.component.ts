import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { BillingDetails } from '../../../domain/model/billing-details.model';
import { ContractingClinic } from '../../../domain/model/contracting-clinic.model';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { BROWSER_NAVIGATION } from '../../../application/subscriptions.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';

const trimmed = (minimum: number, maximum: number, extra?: ValidatorFn): ValidatorFn => control => {
  const value = control.value.trim();
  if (!value && minimum) return { required: true };
  if (value.length < minimum) return { minlength: true };
  if (value.length > maximum) return { maxlength: true };
  return extra ? extra({ ...control, value } as typeof control) : null;
};
type Field = keyof BillingDetails;

@Component({
  selector: 'app-checkout',
  imports: [AdminShellComponent, RouterLink, ReactiveFormsModule],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly service = inject(SUBSCRIPTIONS_PORT);
  private readonly route = inject(ActivatedRoute);
  private readonly navigation = inject(BROWSER_NAVIGATION);
  private readonly destroyRef = inject(DestroyRef);
  readonly plan = signal<SubscriptionPlan | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly organization = signal<ContractingClinic | null>(null);
  readonly organizationLoading = signal(true);
  readonly organizationLoadFailed = signal(false);
  readonly checkingOut = signal(false);
  readonly prefillLoading = signal(false);
  readonly prefillError = signal<string | null>(null);
  private prefillRequest?: Subscription;
  readonly incomplete = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    legalName: ['', trimmed(2, 160)],
    ruc: ['', trimmed(1, 11, Validators.pattern(/^\d{11}$/))],
    fiscalAddress: ['', trimmed(5, 200)],
    billingEmail: ['', trimmed(1, 254, Validators.email)],
    purchaseOrder: ['', trimmed(0, 40)]
  });
  readonly fields: { key: Field; label: string; help: string; optional?: boolean; full?: boolean }[] = [
    { key: 'legalName', label: 'Razón social', help: 'ej. Clínica Ejemplo S.A.C.' },
    { key: 'ruc', label: 'RUC', help: 'RUC de 11 dígitos' },
    { key: 'fiscalAddress', label: 'Dirección de facturación', help: 'Av. Javier Prado Este 4200, Lima', full: true },
    { key: 'billingEmail', label: 'Correo de facturación', help: 'maria.lopez@clinicaejemplo.pe' },
    { key: 'purchaseOrder', label: 'Orden de compra (opcional)', help: 'PO-2024-089', optional: true }
  ];

  ngOnInit(): void {
    for (const field of this.fields) {
      const control = this.form.controls[field.key];
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (control.hasError('server')) {
          const { server, ...remaining } = control.errors!;
          control.setErrors(Object.keys(remaining).length ? remaining : null);
        }
      });
    }
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.selectPlan();
      this.prefillRequest?.unsubscribe();
      this.prefillLoading.set(false);
      this.prefillError.set(null);
      this.form.reset();
      this.incomplete.set(false);
      const orderId = params.get('orderId');
      if (!orderId) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
        this.prefillError.set('No se pudieron recuperar los datos de facturación. Complétalos para continuar.');
        return;
      }
      this.prefillLoading.set(true);
      this.prefillRequest = this.service.getPaymentOrder(orderId).pipe(takeUntilDestroyed(this.destroyRef),
        finalize(() => this.prefillLoading.set(false))).subscribe({
        next: order => {
          if (order.planCode === params.get('plan') && order.billing) {
            this.form.patchValue({ ...order.billing, purchaseOrder: order.billing.purchaseOrder ?? '' });
          } else this.prefillError.set('No se pudieron recuperar los datos de facturación. Complétalos para continuar.');
        },
        error: () => this.prefillError.set('No se pudieron recuperar los datos de facturación. Complétalos para continuar.')
      });
    });
    this.reload();
    this.loadOrganization();
  }
  private catalog: SubscriptionPlan[] = [];
  private selectPlan(): void {
    const code = this.route.snapshot.queryParamMap.get('plan');
    this.plan.set(this.catalog.find(plan => plan.code === code && plan.purchaseMode === 'CHECKOUT' &&
      (plan.code === 'BASIC' || plan.code === 'PROFESSIONAL')) ?? null);
  }
  reload(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.service.loadPlans().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: plans => { this.catalog = plans; this.selectPlan(); },
      error: () => this.loadFailed.set(true)
    });
  }
  loadOrganization(): void {
    this.organizationLoading.set(true);
    this.organizationLoadFailed.set(false);
    this.organization.set(null);
    this.service.getContractingClinic().pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => this.organizationLoading.set(false))).subscribe({
      next: organization => this.organization.set(organization),
      error: () => this.organizationLoadFailed.set(true)
    });
  }
  fieldError(field: Field): string | null {
    const control = this.form.controls[field];
    if (!control.touched || !control.errors) return null;
    if (control.hasError('server')) return control.getError('server');
    if (control.hasError('required')) return 'Este campo es obligatorio';
    if (field === 'ruc') return 'El RUC debe tener 11 dígitos';
    if (field === 'billingEmail') return 'Ingresa un correo válido';
    if (control.hasError('maxlength')) return 'Máximo ' + (field === 'legalName' ? 160 : field === 'fiscalAddress' ? 200 : 40) + ' caracteres';
    return 'Ingresa al menos ' + (field === 'legalName' ? 2 : 5) + ' caracteres';
  }
  checkout(): void {
    if (this.checkingOut() || this.prefillLoading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.incomplete.set(true);
      return;
    }
    const plan = this.plan();
    if (this.loading() || this.loadFailed() || this.organizationLoading() || this.organizationLoadFailed() ||
      !this.organization() || !plan || (plan.code !== 'BASIC' && plan.code !== 'PROFESSIONAL')) return;
    const value = this.form.getRawValue();
    const billing: BillingDetails = {
      legalName: value.legalName.trim(), ruc: value.ruc.trim(),
      fiscalAddress: value.fiscalAddress.trim(), billingEmail: value.billingEmail.trim(),
      ...(value.purchaseOrder.trim() ? { purchaseOrder: value.purchaseOrder.trim() } : {})
    };
    this.checkingOut.set(true);
    this.incomplete.set(false);
    this.error.set(null);
    this.service.createCheckoutSession(plan.code, billing).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => this.checkingOut.set(false))).subscribe({
      next: session => {
        try {
          const url = new URL(session.checkoutUrl);
          if (!session.checkoutUrl.startsWith('https://checkout.stripe.com/') ||
            url.origin !== 'https://checkout.stripe.com' || url.username || url.password) throw new Error();
          this.navigation.assign(session.checkoutUrl);
        } catch { this.error.set('No se pudo iniciar el pago.'); }
      },
      error: (response: HttpErrorResponse) => {
        if (response.status === 400 && response.error?.code === 'VALIDATION_FAILED') {
          this.incomplete.set(true);
          const errors = response.error.errors;
          for (const field of this.fields) {
            const message = errors?.['billing.' + field.key];
            if (typeof message === 'string' || Array.isArray(message)) {
              this.form.controls[field.key].setErrors({ server: Array.isArray(message) ? message.join(' ') : message });
              this.form.controls[field.key].markAsTouched();
            }
          }
          const general = errors?.billing;
          if (typeof general === 'string') this.error.set(general);
          return;
        }
        if (response.status === 409 && response.error?.code === 'ORGANIZATION_REQUIRED') {
          this.organization.set(null);
          return;
        }
        const messages: Record<string, string> = {
          '409:PLAN_REQUIRES_SALES_CONTACT': 'Este plan requiere contactar a ventas.',
          '404:PLAN_NOT_FOUND': 'El plan ya no está disponible.',
          '503:PAYMENTS_UNAVAILABLE': 'Los pagos no están disponibles por ahora. Intenta más tarde.',
          '502:PAYMENT_PROVIDER_ERROR': 'No se pudo iniciar el pago con Stripe. Intenta de nuevo.'
        };
        this.error.set(response.status === 0 ? 'No hay conexión con la API. Intenta de nuevo.' :
          response.status === 403 ? 'Tu cuenta no tiene permiso para esta operación.' :
          messages[response.status + ':' + response.error?.code] ?? 'No se pudo iniciar el pago.');
      }
    });
  }
}

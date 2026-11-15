import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SubscriptionRestrictionStore } from '../../../application/subscription-restriction.store';

const RESOURCE_NAMES: Record<string, string> = { SITE: 'sedes', FLOOR: 'pisos', BEACON: 'balizas' };

/** Notice shown in the admin shell when the plan restricts what the clinic can do (MU-09d, MU-14b, MU-05d). */
@Component({
  selector: 'app-subscription-notice',
  imports: [RouterLink],
  templateUrl: './subscription-notice.component.html',
  styleUrl: './subscription-notice.component.css',
})
export class SubscriptionNoticeComponent {
  private readonly store = inject(SubscriptionRestrictionStore);
  readonly restriction = this.store.restriction;
  readonly title = computed(() => {
    const restriction = this.restriction();
    if (!restriction) return '';
    if (restriction.kind === 'PLAN_LIMIT') return 'Llegaste al límite de tu plan';
    if (restriction.standing === 'NONE') return 'Tu clínica aún no tiene un plan';
    if (restriction.standing === 'EXPIRED') return 'Tu plan no está vigente';
    return 'Necesitas un plan vigente';
  });
  readonly detail = computed(() => {
    const restriction = this.restriction();
    if (!restriction) return '';
    if (restriction.kind === 'PLAN_LIMIT') {
      const resource = restriction.resource ? RESOURCE_NAMES[restriction.resource] : 'recursos';
      const limit = restriction.limit !== null ? ` (máximo ${restriction.limit})` : '';
      return `Tu plan no permite registrar más ${resource}${limit}. Lo que ya registraste se mantiene sin cambios.`;
    }
    if (restriction.standing === 'NONE') return 'Elige un plan para crear y editar sedes, mapas y balizas.';
    if (restriction.standing === 'EXPIRED') {
      return 'Puedes consultar tus sedes, pero no modificarlas hasta renovar el plan.';
    }
    return 'Para registrar sedes, pisos o balizas, activa o renueva tu plan. Lo que ya registraste sigue disponible.';
  });
  /** Where the user solves it: a clinic without a plan chooses one; otherwise it reviews the plan it has. */
  readonly action = computed(() => {
    const restriction = this.restriction();
    if (restriction?.kind === 'INACTIVE' && restriction.standing === 'NONE') {
      return { link: '/subscriptions/plans', label: 'Elegir un plan' };
    }
    return { link: '/subscriptions/me', label: 'Ver mi suscripción' };
  });

  dismiss(): void {
    this.store.dismiss();
  }
}

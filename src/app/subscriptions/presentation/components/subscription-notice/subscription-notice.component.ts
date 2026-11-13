import { Component, computed, inject } from '@angular/core';
import { SubscriptionRestrictionStore } from '../../../application/subscription-restriction.store';

const RESOURCE_NAMES: Record<string, string> = { SITE: 'sedes', FLOOR: 'pisos', BEACON: 'balizas' };

/** Notice shown in the admin shell when the plan restricts what the clinic can do (MU-09d, MU-14b, MU-05d). */
@Component({
  selector: 'app-subscription-notice',
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
    return restriction.standing === 'NONE' ? 'Tu clínica aún no tiene un plan' : 'Tu plan no está vigente';
  });
  readonly detail = computed(() => {
    const restriction = this.restriction();
    if (!restriction) return '';
    if (restriction.kind === 'PLAN_LIMIT') {
      const resource = restriction.resource ? RESOURCE_NAMES[restriction.resource] ?? 'recursos' : 'recursos';
      return `Tu plan no permite registrar más ${resource}. Lo que ya registraste se mantiene sin cambios.`;
    }
    return restriction.standing === 'NONE'
      ? 'Elige un plan para crear y editar sedes, mapas y balizas.'
      : 'Puedes consultar tus sedes, pero no modificarlas hasta renovar el plan.';
  });

  dismiss(): void {
    this.store.dismiss();
  }
}

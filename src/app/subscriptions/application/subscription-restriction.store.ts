import { Injectable, computed, signal } from '@angular/core';
import { SubscriptionRestriction } from '../domain/model/subscription-restriction.model';

/**
 * Last plan restriction reported by the API (WI-US23-03). The admin shell shows it as a notice, and pages can read
 * `writesBlocked` to disable actions the plan does not allow instead of letting the user try them.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionRestrictionStore {
  private readonly current = signal<SubscriptionRestriction | null>(null);
  readonly restriction = this.current.asReadonly();
  readonly writesBlocked = computed(() => this.current()?.kind === 'INACTIVE');

  report(restriction: SubscriptionRestriction): void {
    this.current.set(restriction);
  }

  dismiss(): void {
    this.current.set(null);
  }
}

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SubscriptionNoticeComponent } from './subscription-notice.component';
import { SubscriptionRestrictionStore } from '../../../application/subscription-restriction.store';

describe('SubscriptionNoticeComponent', () => {
  let store: SubscriptionRestrictionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SubscriptionNoticeComponent], providers: [provideRouter([])] });
    store = TestBed.inject(SubscriptionRestrictionStore);
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(SubscriptionNoticeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while the plan allows everything', () => {
    expect(render().querySelector('[role="alert"]')).toBeNull();
  });

  it('explains that an expired plan still allows reading the sites and links to the subscription', () => {
    store.report({ kind: 'INACTIVE', standing: 'EXPIRED', message: '' });
    const alert = render().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Tu plan no está vigente');
    expect(alert?.textContent).toContain('no modificarlas hasta renovar');
    expect(alert?.querySelector('a')?.getAttribute('href')).toBe('/subscriptions/me');
  });

  it('asks a clinic without a plan to choose one', () => {
    store.report({ kind: 'INACTIVE', standing: 'NONE', message: '' });
    const element = render();
    expect(element.textContent).toContain('Elige un plan');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/subscriptions/plans');
  });

  it('asks for an active plan when a creation is rejected without saying why', () => {
    store.report({ kind: 'INACTIVE', standing: 'UNKNOWN', message: '' });
    expect(render().textContent).toContain('Necesitas un plan vigente');
  });

  it('names the resource and the limit that was reached and is closed with its button', () => {
    store.report({ kind: 'PLAN_LIMIT', resource: 'BEACON', limit: 20, message: '' });
    const fixture = TestBed.createComponent(SubscriptionNoticeComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('más balizas (máximo 20)');

    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { SubscriptionNoticeComponent } from './subscription-notice.component';
import { SubscriptionRestrictionStore } from '../../../application/subscription-restriction.store';

describe('SubscriptionNoticeComponent', () => {
  let store: SubscriptionRestrictionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SubscriptionNoticeComponent] });
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

  it('explains that an expired plan still allows reading the sites', () => {
    store.report({ kind: 'INACTIVE', standing: 'EXPIRED', message: '' });
    const alert = render().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Tu plan no está vigente');
    expect(alert?.textContent).toContain('no modificarlas hasta renovar');
  });

  it('asks a clinic without a plan to choose one', () => {
    store.report({ kind: 'INACTIVE', standing: 'NONE', message: '' });
    expect(render().textContent).toContain('Elige un plan');
  });

  it('names the resource whose limit was reached and is closed with its button', () => {
    store.report({ kind: 'PLAN_LIMIT', resource: 'BEACON', message: '' });
    const fixture = TestBed.createComponent(SubscriptionNoticeComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('más balizas');

    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});

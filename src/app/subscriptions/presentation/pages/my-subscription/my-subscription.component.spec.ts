import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { SubscriptionsService } from '../../../infrastructure/subscriptions.service';
import { MySubscriptionComponent } from './my-subscription.component';

describe('MySubscriptionComponent', () => {
  const url = environment.apiUrl + '/subscriptions/me';
  const subscription = {
    status: 'ACTIVE',
    plan: { code: 'BASIC', name: 'Básico', price: { amount: 39.90, currency: 'PEN' }, billingInterval: 'MONTH',
      quota: { sites: 3, floors: 10, beacons: 50 } },
    usage: { sites: { used: 2, limit: 3 }, floors: { used: 6, limit: 10 }, beacons: { used: 12, limit: 50 } },
    currentPeriodStart: '2026-11-12T12:00:00Z', currentPeriodEnd: '2026-12-12T12:00:00Z', daysRemaining: 30
  };
  let fixture: ComponentFixture<MySubscriptionComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  const link = (text: string) => Array.from(element.querySelectorAll('a'))
    .find(item => item.textContent?.trim() === text);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MySubscriptionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AUTH_PORT, useValue: {} },
        { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService }]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MySubscriptionComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('shows loading while awaiting the subscription', () => {
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando tu suscripción…');
    http.expectOne(url).flush(subscription);
  });

  it.each([30, 1])('shows the active plan, dates and %s remaining days', daysRemaining => {
    http.expectOne(url).flush({ ...subscription, daysRemaining });
    fixture.detectChanges();
    expect(element.textContent).toContain('Básico');
    expect(element.textContent).toContain('S/ 39.90');
    expect(element.textContent).toContain('por mes');
    expect(element.querySelector('.badge--success')?.textContent?.trim()).toBe('Activa');
    expect(element.textContent).toContain('Vigente hasta 12/12/2026');
    expect(element.textContent).toContain(daysRemaining === 1 ? 'Queda 1 día' : 'Quedan 30 días');
    expect(link('Cambiar plan')?.getAttribute('href')).toBe('/subscriptions/plans');
    expect(link('Renovar ahora')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=BASIC');
    expect(link('Administración')?.getAttribute('href')).toBe('/admin');
    expect(element.textContent).toContain('Al confirmar el pago, el periodo se reinicia por 1 mes desde la fecha de pago.');
    for (const text of ['Débito automático', 'Se renueva automáticamente', 'Historial de facturas']) {
      expect(element.textContent).not.toContain(text);
    }
  });

  it('shows an expired subscription and renewal link', () => {
    http.expectOne(url).flush({ ...subscription, status: 'EXPIRED', daysRemaining: 0 });
    fixture.detectChanges();
    expect(element.querySelector('.badge--warning')?.textContent?.trim()).toBe('VENCIDA');
    expect(element.textContent).toContain('Tu suscripción venció el 12/12/2026.');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Suscripción vencida — modo restringido.');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No podrás registrar sedes, pisos ni balizas hasta renovar.');
    const renewals = Array.from(element.querySelectorAll('a')).filter(item => item.textContent?.trim() === 'Renovar ahora');
    expect(renewals.length).toBe(2);
    renewals.forEach(item => expect(item.getAttribute('href')).toBe('/subscriptions/checkout?plan=BASIC'));
    expect(element.textContent).toContain('El uso se congela mientras la suscripción está vencida.');
    expect(element.textContent).toContain('12 de 50');
    expect(element.textContent).not.toContain('Quedan');
  });

  it('shows usage limits and accessible percentages', () => {
    http.expectOne(url).flush(subscription);
    fixture.detectChanges();
    const bars = Array.from(element.querySelectorAll('[role="progressbar"]'));
    expect(bars.length).toBe(3);
    bars.forEach((bar, index) => {
      expect(bar.getAttribute('aria-label')).toBe(['Sedes', 'Pisos', 'Balizas'][index]);
      expect(Number(bar.getAttribute('aria-valuenow'))).toBeCloseTo([200 / 3, 60, 24][index]);
      expect(bar.getAttribute('aria-valuetext')).toBe(['2 de 3', '6 de 10', '12 de 50'][index]);
      expect(bar.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('100');
      expect(parseFloat((bar.firstElementChild as HTMLElement).style.width)).toBeCloseTo(Number(bar.getAttribute('aria-valuenow')));
    });
    expect(element.textContent).toContain('El consumo se actualiza automáticamente al agregar o retirar sedes, pisos y balizas.');
  });

  it('shows unlimited consumption without percentage bars', () => {
    http.expectOne(url).flush({ ...subscription,
      plan: { ...subscription.plan, quota: { sites: null, floors: null, beacons: null } },
      usage: { sites: { used: 4, limit: null }, floors: { used: 20, limit: null }, beacons: { used: 100, limit: null } }
    });
    fixture.detectChanges();
    for (const used of [4, 20, 100]) expect(element.textContent).toContain(used + ' · ilimitado');
    expect(element.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('caps over-limit bars and handles zero limits without invalid percentages', () => {
    http.expectOne(url).flush({ ...subscription,
      usage: { sites: { used: 4, limit: 3 }, floors: { used: 0, limit: 0 }, beacons: { used: 1, limit: 0 } }
    });
    fixture.detectChanges();
    const bars = Array.from(element.querySelectorAll('[role="progressbar"]'));
    expect(bars.map(bar => bar.getAttribute('aria-valuenow'))).toEqual(['100', '0', '100']);
    expect(bars.map(bar => (bar.firstElementChild as HTMLElement).style.width)).toEqual(['100%', '0%', '100%']);
    expect(element.textContent).toContain('4 de 3');
  });

  it('shows the new plan and period returned after a confirmed plan change', () => {
    http.expectOne(url).flush(subscription);
    fixture.detectChanges();
    fixture.componentInstance.load();
    http.expectOne(url).flush({ ...subscription,
      plan: { ...subscription.plan, code: 'PROFESSIONAL', name: 'Profesional', price: { amount: 99, currency: 'PEN' } },
      currentPeriodStart: '2026-11-20T12:00:00Z', currentPeriodEnd: '2026-12-20T12:00:00Z', daysRemaining: 30
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Profesional');
    expect(element.textContent).toContain('S/ 99.00');
    expect(element.textContent).toContain('Vigente hasta 20/12/2026');
    expect(element.textContent).not.toContain('Básico');
    expect(element.textContent).not.toContain('12/12/2026');
    expect(link('Renovar ahora')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=PROFESSIONAL');
  });

  it('shows the empty state and plans link for a missing subscription', () => {
    http.expectOne(url).flush({ code: 'SUBSCRIPTION_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Aún no tienes una suscripción activa.');
    expect(link('Ver planes')?.getAttribute('href')).toBe('/subscriptions/plans');
  });

  it.each([
    [0, 'No hay conexión con la API. Intenta de nuevo.'],
    [403, 'Tu cuenta no tiene permiso para esta operación.'],
    [500, 'No se pudo cargar tu suscripción.']
  ])('shows error %s and retries', (status, message) => {
    const request = http.expectOne(url);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    const retry = Array.from(element.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Reintentar')!;
    retry.click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Cargando tu suscripción…');
    http.expectOne(url).flush(subscription);
    fixture.detectChanges();
    expect(element.querySelector('.badge--success')).not.toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});

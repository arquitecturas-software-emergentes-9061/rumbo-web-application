import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { SubscriptionsService } from '../../../infrastructure/subscriptions.service';
import { PlansComponent } from './plans.component';

describe('PlansComponent', () => {
  const url = environment.apiUrl + '/subscriptions/plans';
  const me = environment.apiUrl + '/subscriptions/me';
  const plans: SubscriptionPlan[] = [
    { code: 'BASIC', name: 'Básico', price: { amount: 39.90, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CHECKOUT', quota: { sites: 1, floors: 3, beacons: 15 } },
    { code: 'PROFESSIONAL', name: 'Profesional', price: { amount: 49.99, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CHECKOUT', quota: { sites: 3, floors: 10, beacons: 50 } },
    { code: 'ENTERPRISE', name: 'Enterprise', price: { amount: 59.99, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CONTACT_SALES', quota: { sites: null, floors: null, beacons: null } }
  ];
  let fixture: ComponentFixture<PlansComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let authenticated: boolean;

  beforeEach(() => {
    authenticated = true;
    TestBed.configureTestingModule({
      imports: [PlansComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AUTH_PORT, useValue: { isAuthenticated: () => authenticated } },
        { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService }]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PlansComponent);
    element = fixture.nativeElement;
  });
  afterEach(() => http.verify());

  function load(code = 'PROFESSIONAL', status = 'ACTIVE', used = { sites: 1, floors: 3, beacons: 15 }, catalog = plans): void {
    fixture.detectChanges();
    http.expectOne(url).flush(catalog);
    http.expectOne(me).flush({
      status, plan: plans.find(plan => plan.code === code),
      usage: Object.fromEntries(Object.entries(used).map(([key, value]) => [key, { used: value, limit: null }])),
      currentPeriodStart: '2026-11-12', currentPeriodEnd: '2026-12-12', daysRemaining: 30
    });
    fixture.detectChanges();
  }
  const link = (text: string) => Array.from(element.querySelectorAll('a')).find(item => item.textContent?.trim() === text);
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find(item => item.textContent?.trim() === text);

  it('disables the active plan and permits a downgrade at the quota boundary', () => {
    load();
    expect(button('Plan actual')?.disabled).toBe(true);
    expect(link('Cambiar a Básico')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=BASIC');
    expect(element.textContent).not.toContain('Tu consumo supera');
  });
  it('offers renewal for the expired plan', () => {
    load('PROFESSIONAL', 'EXPIRED');
    expect(link('Renovar plan Profesional')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=PROFESSIONAL');
  });
  it('offers an upgrade', () => {
    load('BASIC');
    expect(link('Mejorar plan')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=PROFESSIONAL');
  });
  it.each(['sites', 'floors', 'beacons'] as const)('blocks a downgrade when %s exceeds its quota even when expired', key => {
    load('PROFESSIONAL', 'EXPIRED', { sites: 1, floors: 3, beacons: 15, [key]: plans[0].quota[key]! + 1 });
    const action = button('Cambiar a Básico');
    expect(action?.disabled).toBe(true);
    expect(element.querySelector('#' + action?.getAttribute('aria-describedby'))?.textContent)
      .toBe('Tu consumo supera los límites de este plan');
    expect(link('Cambiar a Básico')).toBeUndefined();
  });
  it('uses catalog order rather than plan codes or prices', () => {
    load('BASIC', 'ACTIVE', { sites: 0, floors: 0, beacons: 0 }, [plans[1], plans[0], plans[2]]);
    expect(link('Cambiar a Profesional')?.getAttribute('href')).toBe('/subscriptions/checkout?plan=PROFESSIONAL');
  });
  it('renders catalog prices, limits, unlimited text and sales contact', () => {
    load();
    expect(Array.from(element.querySelectorAll('.price')).map(item => item.textContent))
      .toEqual(['S/ 39.90', 'S/ 49.99', 'S/ 59.99']);
    for (const text of ['LÍMITES DEL PLAN', '1 sede · 3 pisos · 15 balizas',
      '3 sedes · 10 pisos · 50 balizas', 'Sedes, pisos y balizas ilimitados', 'Contactar a ventas']) {
      expect(element.textContent).toContain(text);
    }
    expect(element.querySelector('.contact-sales')?.textContent).toBe('Contactar a ventas');
  });
  it('renders returned quotas with singular, plural and mixed unlimited values', () => {
    load('BASIC', 'ACTIVE', undefined, [
      { ...plans[0], quota: { sites: 2, floors: 1, beacons: 1 }, price: { amount: 72, currency: 'USD' } },
      { ...plans[1], quota: { sites: null, floors: 0, beacons: null } }, plans[2]
    ]);
    expect(element.textContent).toContain('2 sedes · 1 piso · 1 baliza');
    expect(element.textContent).toContain('Sedes ilimitadas · 0 pisos · Balizas ilimitadas');
    expect(element.textContent).toContain('USD 72.00');
  });
  it('shows plain purchase actions after /me returns 404', () => {
    fixture.detectChanges();
    http.expectOne(url).flush(plans);
    http.expectOne(me).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(Array.from(element.querySelectorAll('a')).filter(item => item.textContent?.trim() === 'Elegir plan')
      .map(item => item.getAttribute('href'))).toEqual(['/subscriptions/checkout?plan=BASIC', '/subscriptions/checkout?plan=PROFESSIONAL']);
  });
  it('does not request /me without an administrator session', () => {
    authenticated = false;
    fixture.detectChanges();
    http.expectOne(url).flush(plans);
    http.expectNone(me);
    fixture.detectChanges();
    expect(link('Elegir plan')).toBeDefined();
  });
  it('shows loading until both requests finish and retries subscription failures', () => {
    fixture.detectChanges();
    http.expectOne(url).flush(plans);
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Cargando planes…');
    http.expectOne(me).flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe('No se pudo cargar tu suscripción.');
    button('Reintentar')!.click();
    http.expectOne(url).flush(plans);
    http.expectOne(me).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(link('Elegir plan')).toBeDefined();
  });
  it('shows catalog failures and empty catalogs', () => {
    fixture.detectChanges();
    http.expectOne(url).flush({}, { status: 500, statusText: 'Error' });
    http.expectOne(me).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('No se pudieron cargar los planes.');
    button('Reintentar')!.click();
    http.expectOne(url).flush([]);
    http.expectOne(me).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('No hay planes disponibles por ahora.');
  });
});

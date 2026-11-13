import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { SubscriptionsService } from '../../../infrastructure/subscriptions.service';
import { PaymentResultComponent } from './payment-result.component';

describe('PaymentResultComponent', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const url = environment.apiUrl + '/subscriptions/payment-orders/' + id;
  const meUrl = environment.apiUrl + '/subscriptions/me';
  const active = { status: 'ACTIVE', plan: { code: 'BASIC', name: 'Básico' }, currentPeriodStart: '2026-11-12T12:00:00Z', currentPeriodEnd: '2026-12-12T12:00:00Z', daysRemaining: 30 };
  const order = { organization: { id: 'org-1', name: 'Rumbo' }, orderId: id, planCode: 'BASIC', status: 'PAID', amount: 39.90, currency: 'PEN', createdAt: '2026-11-12T00:00:00Z' };
  let fixture: ComponentFixture<PaymentResultComponent>;
  let http: HttpTestingController;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    query = new BehaviorSubject(convertToParamMap({ status: 'success', orderId: id }));
    TestBed.configureTestingModule({
      imports: [PaymentResultComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: query.asObservable() } },
        { provide: AUTH_PORT, useValue: {} },
        { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService }]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PaymentResultComponent);
    element = fixture.nativeElement;
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });
  function start(status = 'success', orderId = id, catalogFails = false): void {
    query.next(convertToParamMap({ status, orderId }));
    fixture.detectChanges();
    if (orderId === id) {
      const catalog = http.expectOne(environment.apiUrl + '/subscriptions/plans');
      if (catalogFails) catalog.flush({}, { status: 500, statusText: 'Error' });
      else catalog.flush([{ code: 'BASIC', name: 'Básico' }]);
    }
  }
  function respond(status: string): void {
    http.expectOne(url).flush({ ...order, status });
    fixture.detectChanges();
  }
  function activate(subscription = active): void {
    http.expectOne(meUrl).flush(subscription);
    fixture.detectChanges();
  }
  function button(text: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text)!;
  }
  it('announces paid success with the plan, amount and panel link', () => {
    start(); respond('PAID'); activate();
    expect(element.querySelector('.success[role="status"]')?.textContent).toContain('Pago confirmado. Tu plan Básico está activo.');
    expect(element.textContent).toContain('S/ 39.90');
    expect(element.textContent).toContain('Datos de la orden');
    expect(element.textContent).toContain('Rumbo');
    expect(element.textContent).toContain(id);
    expect(element.textContent).toContain('12/11/2026');
    expect(element.textContent).toContain('Del 12/11/2026 al 12/12/2026');
    expect(element.textContent).toContain('Quedan 30 días');
    const link = (text: string) => Array.from(element.querySelectorAll('a'))
      .find(item => item.textContent?.trim() === text);
    expect(link('Ir al panel')?.getAttribute('href')).toBe('/admin');
    expect(link('Ver mi suscripción')?.getAttribute('href')).toBe('/subscriptions/me');
  });
  it('polls after two seconds and stops when paid on the second attempt', () => {
    start(); respond('PENDING');
    vi.advanceTimersByTime(1999); http.expectNone(url);
    vi.advanceTimersByTime(1); respond('PAID'); activate();
    vi.advanceTimersByTime(10000); http.expectNone(url);
    expect(element.querySelector('.success')).not.toBeNull();
  });
  it('stops after five attempts and allows another round', () => {
    start(); respond('PENDING');
    for (let i = 1; i < 5; i++) { vi.advanceTimersByTime(2000); respond('PENDING'); }
    vi.advanceTimersByTime(10000); http.expectNone(url);
    expect(element.textContent).toContain('Tu pago aún se está confirmando. Revisa el estado más tarde.');
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === 'Volver a consultar')!;
    expect(button.textContent).toBe('Volver a consultar');
    button.click(); respond('PAID'); activate();
  });
  it.each(['success', 'cancelled'])('shows cancellation for return status %s', status => {
    start(status); respond('CANCELLED');
    expect(element.textContent).toContain('Pago cancelado. No se realizó ningún cargo.');
    expect(element.textContent).toContain('Básico');
  });
  it('keeps a cancelled return cancelled even if the order is pending', () => {
    start('cancelled'); respond('PENDING');
    vi.advanceTimersByTime(10000); http.expectNone(url);
    expect(element.textContent).toContain('Pago cancelado. No se realizó ningún cargo.');
  });
  it.each(['FAILED', 'EXPIRED'])('shows an alert for %s', status => {
    start(); respond(status);
    expect(element.querySelector('[role="alert"]')?.textContent).toBe('El pago no se completó.');
  });
  it.each(['', 'invalid'])('rejects missing or invalid order %s without requests', orderId => {
    start('success', orderId);
    http.expectNone(() => true);
    expect(element.textContent).toContain('No encontramos la orden de pago.');
    expect(element.querySelector('.result a')?.getAttribute('href')).toBe('/subscriptions/plans');
  });
  it.each([
    [404, 'No encontramos la orden de pago.'],
    [0, 'No hay conexión con la API. Intenta de nuevo.'],
    [403, 'Tu cuenta no tiene permiso para esta operación.'],
    [500, 'No se pudo consultar el pago.']
  ])('handles HTTP %s', (status, message) => {
    start();
    const request = http.expectOne(url);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    if (status !== 404) {
      const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === 'Reintentar')!;
      expect(button.textContent).toBe('Reintentar');
      button.click(); respond('PAID'); activate();
    }
  });
  it('falls back to the plan code when the catalog fails', () => {
    start('success', id, true); respond('PAID'); activate();
    expect(element.querySelector('.success')?.textContent).toContain('Tu plan BASIC está activo.');
  });
  it('waits after a 404 and confirms activation on the next attempt after two seconds', () => {
    start(); respond('PAID');
    http.expectOne(meUrl).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Pago confirmado. Estamos activando tu plan.');
    expect(element.textContent).not.toContain('activo');
    vi.advanceTimersByTime(1999); http.expectNone(meUrl);
    vi.advanceTimersByTime(1); activate();
    expect(element.textContent).toContain('Tu plan Básico está activo.');
    vi.advanceTimersByTime(10000); http.expectNone(meUrl);
  });
  it.each([
    { ...active, status: 'EXPIRED' },
    { ...active, plan: { code: 'PROFESSIONAL', name: 'Profesional' } }
  ])('does not announce activation for an incompatible subscription %j', subscription => {
    start(); respond('PAID'); activate(subscription);
    expect(element.textContent).toContain('Estamos activando tu plan.');
    expect(element.textContent).not.toContain('activo');
  });
  it('exhausts five activation attempts and retries only the subscription by button text', () => {
    start(); respond('PAID');
    for (let i = 0; i < 5; i++) {
      if (i) vi.advanceTimersByTime(2000);
      http.expectOne(meUrl).flush({}, { status: 404, statusText: 'Not Found' });
    }
    fixture.detectChanges();
    expect(element.textContent).toContain('La activación está tardando. Revisa Mi suscripción más tarde.');
    expect(element.textContent).not.toContain('activo');
    vi.advanceTimersByTime(10000); http.expectNone(meUrl);
    button('Volver a consultar').click();
    http.expectNone(url); activate({ ...active, daysRemaining: 1 });
    expect(element.textContent).toContain('Queda 1 día');
  });
  it('shows an activation HTTP error and retries by button text', () => {
    start(); respond('PAID');
    http.expectOne(meUrl).flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudo confirmar la activación');
    expect(element.textContent).not.toContain('activo');
    vi.advanceTimersByTime(10000); http.expectNone(meUrl);
    button('Reintentar').click(); activate();
    expect(element.textContent).toContain('Tu plan Básico está activo.');
  });
  it.each(['FAILED', 'EXPIRED', 'CANCELLED', 'PENDING'])('does not query subscriptions or show order details for %s', status => {
    start(); respond(status);
    http.expectNone(meUrl);
    expect(element.textContent).not.toContain('Datos de la orden');
    expect(element.textContent).not.toContain('está activo');
  });
  it.each(['destroy', 'parameters'])('cancels activation timers on %s', action => {
    start(); respond('PAID');
    http.expectOne(meUrl).flush({}, { status: 404, statusText: 'Not Found' });
    if (action === 'destroy') fixture.destroy();
    else query.next(convertToParamMap({ orderId: 'invalid' }));
    vi.advanceTimersByTime(10000); http.expectNone(meUrl);
  });
  it.each(['destroy', 'parameters'])('cancels an activation request on %s', action => {
    start(); respond('PAID');
    const request = http.expectOne(meUrl);
    if (action === 'destroy') fixture.destroy();
    else query.next(convertToParamMap({ orderId: 'invalid' }));
    expect(request.cancelled).toBe(true);
  });
  it('cancels polling when destroyed', () => {
    start(); respond('PENDING'); fixture.destroy();
    vi.advanceTimersByTime(10000); http.expectNone(url);
  });
  it('cancels polling when query parameters change', () => {
    start(); respond('PENDING');
    query.next(convertToParamMap({ orderId: 'invalid' }));
    vi.advanceTimersByTime(10000); http.expectNone(url);
    fixture.detectChanges();
    expect(element.textContent).toContain('No encontramos la orden de pago.');
  });
});

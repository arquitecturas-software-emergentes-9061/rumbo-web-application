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
  const order = { orderId: id, planCode: 'BASIC', status: 'PAID', amount: 39.90, currency: 'PEN', createdAt: '2026-11-12T00:00:00Z' };
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
  it('announces paid success with the plan, amount and panel link', () => {
    start(); respond('PAID');
    expect(element.querySelector('.success[role="status"]')?.textContent).toContain('Pago confirmado. Tu plan Básico está activo.');
    expect(element.textContent).toContain('S/ 39.90');
    expect(element.querySelector('.primary-action')?.getAttribute('href')).toBe('/admin');
  });
  it('polls after two seconds and stops when paid on the second attempt', () => {
    start(); respond('PENDING');
    vi.advanceTimersByTime(1999); http.expectNone(url);
    vi.advanceTimersByTime(1); respond('PAID');
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
    button.click(); respond('PAID');
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
      button.click(); respond('PAID');
    }
  });
  it('falls back to the plan code when the catalog fails', () => {
    start('success', id, true); respond('PAID');
    expect(element.querySelector('.success')?.textContent).toContain('Tu plan BASIC está activo.');
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

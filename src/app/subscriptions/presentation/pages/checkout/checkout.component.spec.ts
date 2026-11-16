import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { SubscriptionsService } from '../../../infrastructure/subscriptions.service';
import { BROWSER_NAVIGATION } from '../../../application/subscriptions.ports';
import { CheckoutComponent } from './checkout.component';

describe('CheckoutComponent billing step', () => {
  const api = environment.apiUrl;
  const checkoutUrl = api + '/subscriptions/checkout-sessions';
  const clinic = { id: 'clinic-1', name: 'Clínica Rumbo' };
  const plans = [
    { code: 'BASIC', name: 'Básico', price: { amount: 39.90, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CHECKOUT', quota: { sites: 1, floors: 3, beacons: 15 } },
    { code: 'ENTERPRISE', name: 'Enterprise', price: { amount: 100, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CONTACT_SALES', quota: { sites: null, floors: null, beacons: null } }
  ];
  const billing = { legalName: 'Clínica Rumbo', ruc: '20123456789', fiscalAddress: 'Av. Lima 123', billingEmail: 'pagos@example.com' };
  const session = { checkoutUrl: 'https://checkout.stripe.com/c/pay/test', billing };
  let fixture: ComponentFixture<CheckoutComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const assign = vi.fn();
  beforeEach(() => {
    assign.mockReset();
    query = new BehaviorSubject(convertToParamMap({ plan: 'BASIC' }));
    TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          queryParamMap: query.asObservable(), snapshot: { get queryParamMap() { return query.value; } }
        } },
        { provide: AUTH_PORT, useValue: {} },
        { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService },
        { provide: BROWSER_NAVIGATION, useValue: { assign } }]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CheckoutComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => http.verify());
  function load(organization: boolean = true): void {
    http.expectOne(api + '/subscriptions/plans').flush(plans);
    const request = http.expectOne(api + '/clinics/me');
    if (organization) request.flush(clinic);
    else request.flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
  }
  function button(): HTMLButtonElement {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Continuar al pago'))!;
  }
  function submit(): void {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }
  function fill(purchaseOrder = ''): void {
    fixture.componentInstance.form.setValue({
      legalName: '  ' + billing.legalName + '  ', ruc: ' ' + billing.ruc + ' ',
      fiscalAddress: ' ' + billing.fiscalAddress + ' ', billingEmail: ' ' + billing.billingEmail + ' ', purchaseOrder
    });
    fixture.detectChanges();
  }
  it.each(['XYZ', 'ENTERPRISE', '', 'PROFESSIONAL'])('rejects an invalid or missing catalog plan %s', code => {
    query.next(convertToParamMap({ plan: code }));
    load();
    expect(element.textContent).toContain('El plan no es válido');
    expect(Array.from(element.querySelectorAll('a')).find(link => link.textContent === 'Volver a planes')?.getAttribute('href'))
      .toBe('/subscriptions/plans');
    expect(element.querySelector('form')).toBeNull();
    http.expectNone(checkoutUrl);
  });
  it('shows four required errors and WA15E after empty submit without a POST', () => {
    load();
    expect(button().disabled).toBe(false);
    button().click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.field-error')).toHaveLength(4);
    expect(Array.from(element.querySelectorAll('.field-error')).every(error => error.textContent?.includes('Este campo es obligatorio'))).toBe(true);
    expect(element.textContent).toContain('ACCIÓN REQUERIDA');
    expect(element.textContent).toContain('Datos de facturación incompletos — Completa los campos obligatorios para continuar con el pago.');
    http.expectNone(request => request.method === 'POST');
    expect(element.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(4);
    http.expectNone(checkoutUrl);
  });
  it.each(['PO-123', null])('loads retry billing from the order and submits it, purchase order %s', purchaseOrder => {
    const id = '12345678-1234-1234-1234-123456789abc';
    query.next(convertToParamMap({ plan: 'BASIC', orderId: id }));
    load();
    expect(button().disabled).toBe(true);
    submit();
    http.expectNone(checkoutUrl);
    http.expectOne(api + '/subscriptions/payment-orders/' + id).flush({ planCode: 'BASIC', billing: { ...billing, purchaseOrder } });
    fixture.detectChanges();
    for (const [key, value] of Object.entries(billing)) {
      expect(element.querySelector<HTMLInputElement>('#' + key)?.value).toBe(value);
    }
    expect(element.querySelector<HTMLInputElement>('#purchaseOrder')?.value).toBe(purchaseOrder ?? '');
    button().click();
    const request = http.expectOne({ method: 'POST', url: checkoutUrl });
    expect(request.request.body).toEqual({ planCode: 'BASIC', billing: { ...billing, ...(purchaseOrder ? { purchaseOrder } : {}) } });
    request.flush(session);
    expect(assign).toHaveBeenCalledWith(session.checkoutUrl);
  });
  it('allows manual billing after an order prefill error without starting payment', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    query.next(convertToParamMap({ plan: 'BASIC', orderId: id }));
    load();
    http.expectOne(api + '/subscriptions/payment-orders/' + id).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges(); submit();
    expect(element.textContent).toContain('No se pudieron recuperar los datos de facturación');
    expect(element.textContent).toContain('ACCIÓN REQUERIDA');
    http.expectNone(request => request.method === 'POST');
    fill();
    expect(button().disabled).toBe(false);
  });
  it('cancels stale prefill when the selected plan changes', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    query.next(convertToParamMap({ plan: 'BASIC', orderId: id }));
    const request = http.expectOne(api + '/subscriptions/payment-orders/' + id);
    query.next(convertToParamMap({ plan: 'BASIC' }));
    expect(request.cancelled).toBe(true);
    load();
    expect(fixture.componentInstance.prefillLoading()).toBe(false);
    expect(fixture.componentInstance.form.controls.legalName.value).toBe('');
    http.expectNone(checkoutUrl);
  });
  it('does not prefill billing from an order for another plan', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    query.next(convertToParamMap({ plan: 'BASIC', orderId: id }));
    load();
    http.expectOne(api + '/subscriptions/payment-orders/' + id).flush({ planCode: 'PROFESSIONAL', billing });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.legalName.value).toBe('');
    expect(button().disabled).toBe(false);
    http.expectNone(checkoutUrl);
  });
  it('requires a plan query parameter', () => {
    query.next(convertToParamMap({}));
    load();
    expect(element.textContent).toContain('El plan no es válido');
    expect(element.querySelector('form')).toBeNull();
  });
  it('retries organization loading after a failure', () => {
    http.expectOne(api + '/subscriptions/plans').flush(plans);
    http.expectOne(api + '/clinics/me').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges(); fill();
    expect(button().disabled).toBe(true);
    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent === 'Reintentar')!.click();
    http.expectOne(api + '/clinics/me').flush(clinic);
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
  });
  it.each(['1234567890', '2012345678A', '123456789012'])('validates RUC %s and email on touch', ruc => {
    load();
    fill();
    fixture.componentInstance.form.patchValue({ ruc, billingEmail: 'incorrecto' });
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    expect(element.textContent).toContain('El RUC debe tener 11 dígitos');
    expect(element.textContent).toContain('Ingresa un correo válido');
    expect(button().disabled).toBe(false);
    submit();
    http.expectNone(checkoutUrl);
  });
  it.each(['', '   ', ' PO-2024-089 '])('posts trimmed billing and redirects, purchase order "%s"', purchaseOrder => {
    load();
    fill(purchaseOrder);
    expect(button().disabled).toBe(false);
    button().click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    fixture.componentInstance.checkout();
    const request = http.expectOne({ method: 'POST', url: checkoutUrl });
    expect(request.request.body).toEqual({
      planCode: 'BASIC', billing: { ...billing, ...(purchaseOrder.trim() ? { purchaseOrder: purchaseOrder.trim() } : {}) }
    });
    request.flush(session);
    expect(assign).toHaveBeenCalledExactlyOnceWith(session.checkoutUrl);
  });
  it('maps server field errors and lets the user correct them', () => {
    load();
    fill();
    submit();
    http.expectOne(checkoutUrl).flush({
      code: 'VALIDATION_FAILED', errors: { 'billing.ruc': 'El RUC no es válido' }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(element.querySelector('#ruc-error')?.textContent).toContain('El RUC no es válido');
    expect(element.textContent).toContain('ACCIÓN REQUERIDA');
    expect(button().disabled).toBe(false);
    fixture.componentInstance.form.controls.ruc.setValue('20987654321');
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
  });
  it('shows general billing validation errors', () => {
    load(); fill(); submit();
    http.expectOne(checkoutUrl).flush({ code: 'VALIDATION_FAILED', errors: { billing: 'Revisa los datos fiscales.' } },
      { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Revisa los datos fiscales.');
    expect(element.textContent).toContain('ACCIÓN REQUERIDA');
  });
  it('shows the real catalog price, cycle, total, clinic and support', () => {
    load();
    for (const text of ['Resumen del pedido', 'Básico', '39.90', 'Mensual', 'Total', 'Incluye IGV', 'Contratará: Clínica Rumbo', 'soporte@rumbo.pe']) {
      expect(element.querySelector('[aria-labelledby=summary-title]')?.parentElement?.textContent).toContain(text);
    }
    expect(Array.from(element.querySelectorAll('a')).find(link => link.textContent?.includes('Volver a la selección'))?.getAttribute('href'))
      .toBe('/subscriptions/plans?plan=BASIC');
  });
  it('prevents checkout until organization loads', () => {
    http.expectOne(api + '/subscriptions/plans').flush(plans);
    fixture.detectChanges(); fill(); submit();
    expect(button().disabled).toBe(true);
    http.expectNone(checkoutUrl);
    http.expectOne(api + '/clinics/me').flush(clinic);
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
  });
  it('requires a clinic and links to registration', () => {
    load(false); fill(); submit();
    expect(button().disabled).toBe(true);
    expect(element.textContent).toContain('Registra los datos de tu clínica antes de contratar');
    expect(Array.from(element.querySelectorAll('a')).find(link => link.textContent === 'Registrar clínica')?.getAttribute('href'))
      .toBe('/planning/sites');
    http.expectNone(checkoutUrl);
  });
  it('handles ORGANIZATION_REQUIRED', () => {
    load(); fill(); submit();
    http.expectOne(checkoutUrl).flush({ code: 'ORGANIZATION_REQUIRED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Registrar clínica');
    expect(button().disabled).toBe(true);
    submit();
    http.expectNone(checkoutUrl);
  });
  it.each([
    [503, 'PAYMENTS_UNAVAILABLE', 'Los pagos no están disponibles por ahora. Intenta más tarde.'],
    [502, 'PAYMENT_PROVIDER_ERROR', 'No se pudo iniciar el pago con Stripe. Intenta de nuevo.'],
    [409, 'PLAN_REQUIRES_SALES_CONTACT', 'Este plan requiere contactar a ventas.'],
    [404, 'PLAN_NOT_FOUND', 'El plan ya no está disponible.'],
    [403, '', 'Tu cuenta no tiene permiso para esta operación.'],
    [500, '', 'No se pudo iniciar el pago.'],
    [0, '', 'No hay conexión con la API. Intenta de nuevo.']
  ])('handles checkout error %s and permits retry', (status, code, message) => {
    load(); fill(); submit();
    const request = http.expectOne(checkoutUrl);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ code }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.textContent).toContain(message);
    expect(button().disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    submit();
    http.expectOne(checkoutUrl).flush(session);
    expect(assign).toHaveBeenCalledWith(session.checkoutUrl);
  });
  it.each([
    'https://example.com/pay', 'http://checkout.stripe.com/pay',
    'https://checkout.stripe.com.evil.example/pay', 'https://checkout.stripe.com@evil.example/pay',
    'https://user:password@checkout.stripe.com/pay', '//checkout.stripe.com/pay', 'javascript:alert(1)', 'invalid', null
  ])('rejects unsafe Stripe URL %s', checkoutUrl => {
    load(); fill(); submit();
    http.expectOne(api + '/subscriptions/checkout-sessions').flush({ checkoutUrl });
    fixture.detectChanges();
    expect(assign).not.toHaveBeenCalled();
    expect(element.textContent).toContain('No se pudo iniciar el pago.');
    expect(button().disabled).toBe(false);
  });
  it.each([
    ['legalName', 'A'], ['legalName', 'A'.repeat(161)], ['fiscalAddress', 'abcd'],
    ['fiscalAddress', 'A'.repeat(201)], ['billingEmail', 'a'.repeat(245) + '@example.com'],
    ['purchaseOrder', 'A'.repeat(41)]
  ])('enforces the API length rule for %s', (field, value) => {
    load(); fill();
    fixture.componentInstance.form.get(field)!.setValue(value);
    submit();
    expect(button().disabled).toBe(false);
    http.expectNone(checkoutUrl);
  });
});

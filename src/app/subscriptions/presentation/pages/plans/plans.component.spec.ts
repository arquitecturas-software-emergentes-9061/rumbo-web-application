import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SubscriptionPlan } from '../../../domain/model/subscription-plan.model';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SUBSCRIPTIONS_PORT } from '../../../application/subscriptions.ports';
import { SubscriptionsService } from '../../../infrastructure/subscriptions.service';
import { PlansComponent } from './plans.component';

describe('PlansComponent', () => {
  const url = environment.apiUrl + '/subscriptions/plans';
  const plans: SubscriptionPlan[] = [
    { code: 'BASIC', name: 'Básico', price: { amount: 39.90, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CHECKOUT' },
    { code: 'PROFESSIONAL', name: 'Profesional', price: { amount: 49.99, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CHECKOUT' },
    { code: 'ENTERPRISE', name: 'Enterprise', price: { amount: 59.99, currency: 'PEN' }, billingInterval: 'MONTH', purchaseMode: 'CONTACT_SALES' }
  ];
  let fixture: ComponentFixture<PlansComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryParams = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      imports: [PlansComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          queryParamMap: queryParams.asObservable(),
          snapshot: { get queryParamMap() { return queryParams.value; } }
        } },
        { provide: AUTH_PORT, useValue: {} },
        { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService }]
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PlansComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('shows an accessible loading state until the response arrives', () => {
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Cargando planes…');
    expect(element.querySelector('.plans-grid')).toBeNull();
    http.expectOne(url).flush(plans);
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')).toBeNull();
  });

  it('shows plans in API order with two decimal prices and informative sales text', () => {
    http.expectOne(url).flush(plans);
    fixture.detectChanges();
    const cards = Array.from(element.querySelectorAll('.card'));
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual(['Básico', 'Profesional', 'Enterprise']);
    expect(cards.map(card => card.querySelector('.price')?.textContent)).toEqual(['S/ 39.90', 'S/ 49.99', 'S/ 59.99']);
    expect(cards.every(card => card.querySelector('.interval')?.textContent === 'por mes')).toBe(true);
    expect(cards[2].querySelector('.contact-sales')?.textContent).toBe('Contactar ventas');
    expect(cards[2].querySelector('button')).toBeNull();
    expect(element.querySelectorAll('.plans-grid button')).toHaveLength(2);
  });

  it('selects BASIC, announces its summary and merges the URL query', () => {
    http.expectOne(url).flush(plans);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.plans-grid button')!.click();
    fixture.detectChanges();
    const summary = element.querySelector('.subscription-summary');
    expect(summary?.getAttribute('role')).toBe('status');
    expect(summary?.getAttribute('aria-labelledby')).toBe('subscription-summary-title');
    for (const text of ['Básico', 'S/ 39.90', 'Facturación mensual', 'Soles (PEN)',
      'El pago se realiza en una página segura de Stripe. Podrás revisar el resultado al volver.']) {
      expect(summary?.textContent).toContain(text);
    }
    expect(element.querySelector('.card.selected h2')?.textContent).toBe('Básico');
    expect(element.querySelector('.plans-grid button')?.getAttribute('aria-pressed')).toBe('true');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute), queryParams: { plan: 'BASIC' },
      queryParamsHandling: 'merge', replaceUrl: true
    });
    summary!.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.subscription-summary, .card.selected')).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute), queryParams: { plan: null },
      queryParamsHandling: 'merge', replaceUrl: true
    });
  });

  it.each(['PROFESSIONAL', 'ENTERPRISE', 'XYZ', ''])('restores only a checkout plan from initial query %s', code => {
    queryParams.next(convertToParamMap({ plan: code }));
    http.expectOne(url).flush(plans);
    fixture.detectChanges();
    if (code === 'PROFESSIONAL') {
      expect(element.querySelector('.subscription-summary')?.textContent).toContain('Profesional');
      expect(element.querySelectorAll('.plans-grid button')[1].getAttribute('aria-pressed')).toBe('true');
      expect(navigate).not.toHaveBeenCalled();
    } else {
      expect(element.querySelector('.subscription-summary, .card.selected')).toBeNull();
      expect(navigate).toHaveBeenCalledWith([], {
        relativeTo: TestBed.inject(ActivatedRoute), queryParams: { plan: null },
        queryParamsHandling: 'merge', replaceUrl: true
      });
    }
  });

  it('updates selection when the route query changes after loading', () => {
    http.expectOne(url).flush(plans);
    queryParams.next(convertToParamMap({ plan: 'BASIC' }));
    fixture.detectChanges();
    expect(element.querySelector('.subscription-summary')?.textContent).toContain('Básico');
    queryParams.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(element.querySelector('.subscription-summary')).toBeNull();
  });

  it.each([
    [0, 'No hay conexión con la API. Intenta de nuevo.'],
    [403, 'Tu cuenta no tiene permiso para esta operación.'],
    [401, 'No se pudieron cargar los planes.'],
    [500, 'No se pudieron cargar los planes.']
  ])('shows the message for status %s and retries successfully', (status, message) => {
    const request = http.expectOne(url);
    if (status === 0) {
      request.error(new ProgressEvent('error'));
    } else {
      request.flush({ code: 'PLAN_CATALOG_ERROR' }, { status, statusText: 'Error' });
    }
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('No hay planes disponibles por ahora.');
    const retry = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Reintentar');
    expect(retry?.textContent).toBe('Reintentar');
    retry!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Cargando planes…');
    http.expectOne({ method: 'GET', url }).flush(plans);
    fixture.detectChanges();
    expect(element.querySelectorAll('.card')).toHaveLength(3);
    expect(Array.from(element.querySelectorAll('button')).some(button => button.textContent === 'Reintentar')).toBe(false);
  });

  it('shows the empty catalog message', () => {
    http.expectOne(url).flush([]);
    fixture.detectChanges();
    expect(element.textContent).toContain('No hay planes disponibles por ahora.');
    expect(element.querySelector('.plans-grid, [role="alert"], [role="status"]')).toBeNull();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { SitesService } from './sites.service';

describe('Planning HTTP contract', () => {
  let service: SitesService;
  let http: HttpTestingController;
  const base = environment.apiUrl;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SitesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('distinguishes an unregistered clinic from a forbidden request', () => {
    service.getOrganization().subscribe(result => expect(result).toBeNull());
    http.expectOne({ method: 'GET', url: base + '/clinics/me' }).flush(null, { status: 404, statusText: 'Not Found' });
    service.getOrganization().subscribe({ error: error => expect(error.status).toBe(403) });
    http.expectOne({ method: 'GET', url: base + '/clinics/me' }).flush(null, { status: 403, statusText: 'Forbidden' });
  });

  it('uses server identities and preserves the confirmed address', () => {
    const request = { name: 'Sede', address: 'Av. Central', allowDuplicateAddress: true };
    const response = { ...request, id: 'server-site', clinicId: 'server-clinic' };
    service.createSite(request).subscribe(result => expect(result).toEqual(response));
    const call = http.expectOne({ method: 'POST', url: base + '/sites' });
    expect(call.request.body).toEqual(request);
    call.flush(response);
  });

  it('lists and creates floors under the selected site', () => {
    const request = { number: -1, name: 'Sótano', description: '' };
    const response = { ...request, id: 'server-floor', siteId: 'server-site' };
    const url = base + '/sites/server-site/floors';
    service.createFloor('server-site', request).subscribe(floor => expect(floor).toEqual(response));
    const create = http.expectOne({ method: 'POST', url });
    expect(create.request.body).toEqual(request);
    create.flush(response);
    service.loadFloors('server-site').subscribe(floors => expect(floors).toEqual([response]));
    http.expectOne({ method: 'GET', url }).flush([response]);
  });
});

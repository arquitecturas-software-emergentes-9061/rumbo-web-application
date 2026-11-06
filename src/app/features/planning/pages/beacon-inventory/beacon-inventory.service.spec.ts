import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { BeaconInventoryService } from './beacon-inventory.service';

describe('Beacon inventory HTTP contract', () => {
  let service: BeaconInventoryService;
  let http: HttpTestingController;
  const url = environment.apiUrl + '/sites/site-a/beacons';
  const input = { floorId: 'floor-a', identifier: 'AA:BB:01', x: 0, y: 12.5 };
  const beacon = { ...input, identifier: 'aa:bb:01', id: 'beacon-a', siteId: 'site-a', active: true };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BeaconInventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the floor query parameter and can also read the full site inventory', () => {
    service.list('site-a', 'floor-a').subscribe(items => expect(items).toEqual([beacon]));
    http.expectOne({ method: 'GET', url: url + '?floorId=floor-a' }).flush([beacon]);
    service.list('site-a', '').subscribe(items => expect(items).toEqual([]));
    http.expectOne({ method: 'GET', url }).flush([]);
  });

  it('sends only the existing registration and status fields', () => {
    service.register('site-a', input).subscribe(result => expect(result).toEqual(beacon));
    const registration = http.expectOne({ method: 'POST', url });
    expect(registration.request.body).toEqual(input);
    registration.flush(beacon, { status: 201, statusText: 'Created' });

    service.setActive('site-a', beacon.id, false).subscribe(result => expect(result.active).toBe(false));
    const update = http.expectOne({ method: 'PATCH', url: url + '/beacon-a/status' });
    expect(update.request.body).toEqual({ active: false });
    update.flush({ ...beacon, active: false });
  });

  it('preserves the duplicate error code for the form', () => {
    service.register('site-a', input).subscribe({
      error: error => expect(error.error.code).toBe('BEACON_IDENTIFIER_EXISTS'),
    });
    http.expectOne({ method: 'POST', url }).flush(
      { code: 'BEACON_IDENTIFIER_EXISTS' }, { status: 409, statusText: 'Conflict' },
    );
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { BeaconsService } from './beacons.service';

describe('Beacon inventory HTTP contract', () => {
  let service: BeaconsService;
  let http: HttpTestingController;
  const base = environment.apiUrl + '/sites/site-1';
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BeaconsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const request = {
    floorId: 'f', identifier: 'ac:23:3f:8a:11:c4', name: 'B-05', proximityUuid: 'u', major: 1, minor: 2,
    txPowerDbm: -59, x: null, y: null
  };

  it('registers, edits and toggles a beacon under the selected site', () => {
    service.register('site-1', request).subscribe();
    expect(http.expectOne({ method: 'POST', url: base + '/beacons' }).request.body).toEqual(request);
    service.update('site-1', 'b 1', request).subscribe();
    http.expectOne({ method: 'PUT', url: base + '/beacons/b%201' }).flush({});
    service.setActive('site-1', 'b1', true).subscribe();
    expect(http.expectOne({ method: 'PATCH', url: base + '/beacons/b1/status' }).request.body).toEqual({ active: true });
  });

  it('reads plan bounds from the draft and treats a missing draft as no plans', () => {
    service.loadPlanBounds('site-1').subscribe(plans => expect(plans).toEqual([{ floorId: 'f', widthUnits: 100, heightUnits: 60 }]));
    http.expectOne({ method: 'GET', url: base + '/maps/draft/graph' })
      .flush({ plans: [{ floorId: 'f', planVersionId: 'v', widthUnits: 100, heightUnits: 60 }] });
    service.loadPlanBounds('site-1').subscribe(plans => expect(plans).toEqual([]));
    http.expectOne(base + '/maps/draft/graph').flush(null, { status: 404, statusText: 'Not Found' });
  });
});

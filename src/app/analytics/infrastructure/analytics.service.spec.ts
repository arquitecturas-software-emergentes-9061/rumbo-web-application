import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from './analytics.service';

describe('Analytics HTTP contract', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;
  const base = environment.apiUrl;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists the sites with an official map', () => {
    service.listSites().subscribe(sites => expect(sites).toEqual([{ id: 's1', name: 'Sede Central' }]));
    http.expectOne({ method: 'GET', url: base + '/published-sites' }).flush([{ id: 's1', name: 'Sede Central' }]);
  });

  it('reads the official model and treats a site without published map as null', () => {
    service.loadModel('s1').subscribe(model => expect(model).toMatchObject({ siteId: 's1', walls: [], doors: [] }));
    http.expectOne(base + '/sites/s1/published-map').flush({ siteId: 's1', plans: [], floors: [], nodes: [], destinations: [] });
    service.loadModel('s1').subscribe(model => expect(model).toBeNull());
    http.expectOne(base + '/sites/s1/published-map').flush({ code: 'PUBLISHED_MAP_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  });

  it('asks the heatmap of a site for a period', () => {
    service.loadHeatmap('s1', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z').subscribe();
    const call = http.expectOne(request => request.url === base + '/analytics/navigation-heatmap');
    expect(call.request.params.get('siteId')).toBe('s1');
    expect(call.request.params.get('from')).toBe('2026-09-01T00:00:00.000Z');
    expect(call.request.params.get('to')).toBe('2026-10-01T00:00:00.000Z');
    call.flush({ cells: [], discardedEvents: 0 });
  });
});

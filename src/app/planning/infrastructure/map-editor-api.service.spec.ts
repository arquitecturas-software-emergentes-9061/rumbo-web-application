import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { MapEditorApiService } from './map-editor-api.service';

describe('MapEditorApiService first draft', () => {
  let service: MapEditorApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MapEditorApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the selected plans and returns the draft with its ETag', () => {
    let snapshot: unknown;
    service.createFirstDraft('site-1', [{ floorId: 'f1', planVersionId: 'p1' }]).subscribe(value => snapshot = value);
    const request = http.expectOne(`${environment.apiUrl}/sites/site-1/maps/draft`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ plans: [{ floorId: 'f1', planVersionId: 'p1' }] });
    request.flush({
      siteId: 'site-1', mapId: 'm1', modelVersionId: 'v1', status: 'DRAFT',
      plans: [{ floorId: 'f1', planVersionId: 'p1', widthUnits: 200, heightUnits: 100, metersPerUnit: null }],
      nodes: [], connections: [], destinations: []
    }, { headers: { ETag: '"rev-0"' }, status: 201, statusText: 'Created' });
    expect(snapshot).toMatchObject({ mapId: 'm1', modelVersionId: 'v1', etag: '"rev-0"' });
  });

  it('fails when the response carries no ETag', () => {
    let failed = false;
    service.createFirstDraft('s', [{ floorId: 'f', planVersionId: 'p' }]).subscribe({ error: () => failed = true });
    http.expectOne(`${environment.apiUrl}/sites/s/maps/draft`).flush(
      { siteId: 's', mapId: 'm', modelVersionId: 'v', status: 'DRAFT', plans: [], nodes: [], connections: [], destinations: [] });
    expect(failed).toBe(true);
  });
});

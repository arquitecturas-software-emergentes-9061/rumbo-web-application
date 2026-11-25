import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { MapEditorApiService } from './map-editor-api.service';
import { DraftSnapshot } from '../application/map-editor.contracts';

describe('MapEditorApiService first draft', () => {
  let service: MapEditorApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MapEditorApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('publishes the reviewed revision with merge-patch and If-Match', () => {
    const snapshot: DraftSnapshot = { siteId: 'site', mapId: 'map', modelVersionId: 'version', etag: '"rev-3"',
      plans: [], graph: { nodes: [], connections: [], destinations: [] } };
    let published: unknown;
    service.publish(snapshot).subscribe(value => published = value);
    const request = http.expectOne(`${environment.apiUrl}/sites/site/maps/map/versions/version`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'PUBLISHED' });
    expect(request.request.headers.get('If-Match')).toBe('"rev-3"');
    expect(request.request.headers.get('Content-Type')).toBe('application/merge-patch+json');
    request.flush({ siteId: 'site', mapId: 'map', modelVersionId: 'version', status: 'PUBLISHED' });
    expect(published).toMatchObject({ modelVersionId: 'version', status: 'PUBLISHED' });
  });

  it('rejects a publication response for a different version', () => {
    const snapshot: DraftSnapshot = { siteId: 'site', mapId: 'map', modelVersionId: 'version', etag: '"rev-3"',
      plans: [], graph: { nodes: [], connections: [], destinations: [] } };
    let failed = false;
    service.publish(snapshot).subscribe({ error: () => failed = true });
    http.expectOne(`${environment.apiUrl}/sites/site/maps/map/versions/version`)
      .flush({ siteId: 'site', mapId: 'map', modelVersionId: 'other', status: 'PUBLISHED' });
    expect(failed).toBe(true);
  });

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

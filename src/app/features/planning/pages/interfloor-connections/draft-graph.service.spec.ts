import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { DraftGraph, DraftGraphService, GraphConnection } from './draft-graph.service';

describe('Draft graph HTTP contract', () => {
  let service: DraftGraphService;
  let http: HttpTestingController;
  const base = environment.apiUrl + '/sites/site-a/maps';
  const graph: DraftGraph = {
    siteId: 'site-a', mapId: 'map-a', modelVersionId: 'draft-a', status: 'DRAFT',
    nodes: [
      { id: 'a', floorId: '1', planVersionId: 'plan-1', x: 10, y: 5, type: 'ACCESS' },
      { id: 'b', floorId: '2', planVersionId: 'plan-2', x: 5, y: 2, type: 'DESTINATION' },
    ],
    connections: [],
    destinations: [{ id: 'directory-a', nodeId: 'b', name: 'Consultorio', type: 'SERVICE', specialty: null }],
  };
  const edge: GraphConnection = { id: 'e', sourceNodeId: 'a', targetNodeId: 'b', type: 'RAMP',
    accessibility: 'INACCESSIBLE', distanceMeters: 5, weight: 5, verticalPenalty: 0, bidirectional: true };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DraftGraphService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('discovers the site draft and preserves the revision token', () => {
    service.load('site-a').subscribe(snapshot => expect(snapshot).toEqual({ graph, etag: '"rev-0"' }));
    http.expectOne({ method: 'GET', url: base + '/draft/graph' }).flush(graph, { headers: { ETag: '"rev-0"' } });
  });

  it('edits one edge using If-Match and leaves the remaining graph fields intact', () => {
    const existing = { ...edge, id: 'existing' };
    const before = { ...graph, connections: [existing, { ...edge, accessibility: 'UNKNOWN' as const }] };
    const after = { ...graph, connections: [existing, edge] };
    service.save({ graph: before, etag: '"rev-3"' }, edge).subscribe(result =>
      expect(result).toEqual({ graph: after, etag: '"rev-4"' }));
    const call = http.expectOne({ method: 'PUT', url: base + '/map-a/versions/draft-a/graph' });
    expect(call.request.headers.get('If-Match')).toBe('"rev-3"');
    expect(call.request.body).toEqual({ nodes: graph.nodes, connections: after.connections,
      destinations: graph.destinations });
    expect(before.connections[1].accessibility).toBe('UNKNOWN');
    call.flush(after, { headers: { ETag: '"rev-4"' } });
  });
});

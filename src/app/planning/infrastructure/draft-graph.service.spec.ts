import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
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
      { id: 'c', floorId: '1', planVersionId: 'plan-1', x: 8, y: 5, type: 'INTERSECTION' },
    ],
    connections: [],
    destinations: [{ id: 'directory-a', nodeId: 'b', name: 'Consultorio', type: 'SERVICE', specialty: null }],
    walls: [{ id: 'wall-a', floorId: '1', planVersionId: 'plan-1', x1: 0, y1: 0, x2: 0, y2: 10 }],
    doors: [{ id: 'door-a', wallId: 'wall-a', from: .3, to: .4 }],
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

  it('refuses a draft response without geometry instead of risking a destructive save', () => {
    const received: Error[] = [];
    service.load('site-a').subscribe({ error: error => received.push(error) });
    const { walls: _walls, ...incomplete } = graph;
    http.expectOne({ method: 'GET', url: base + '/draft/graph' })
      .flush(incomplete, { headers: { ETag: '"rev-0"' } });
    expect(received[0].message).toBe('Incomplete draft graph response');
  });

  it('edits one edge using If-Match and leaves the remaining graph fields intact', () => {
    const existing = { ...edge, id: 'existing' };
    const horizontal: GraphConnection = { ...edge, id: 'horizontal', sourceNodeId: 'a', targetNodeId: 'c',
      type: 'CORRIDOR', verticalPenalty: 0 };
    const before = { ...graph, connections: [existing, { ...edge, accessibility: 'UNKNOWN' as const }, horizontal] };
    const after = { ...graph, connections: [existing, edge, horizontal] };
    service.save({ graph: before, etag: '"rev-3"' }, edge).subscribe(result =>
      expect(result).toEqual({ graph: after, etag: '"rev-4"' }));
    const call = http.expectOne({ method: 'PUT', url: base + '/map-a/versions/draft-a/graph' });
    expect(call.request.headers.get('If-Match')).toBe('"rev-3"');
    expect(call.request.body).toEqual({ nodes: graph.nodes, connections: after.connections,
      destinations: graph.destinations, walls: graph.walls, doors: graph.doors });
    expect(before.connections[1].accessibility).toBe('UNKNOWN');
    call.flush(after, { headers: { ETag: '"rev-4"' } });
  });

  it('sends every existing floor and geometry with each vertical type and accessibility state', () => {
    for (const type of ['ELEVATOR', 'STAIRS', 'RAMP'] as const) {
      for (const accessibility of ['UNKNOWN', 'ACCESSIBLE', 'INACCESSIBLE'] as const) {
        const link = { ...edge, id: `${type}-${accessibility}`, type, accessibility, verticalPenalty: 3 };
        service.save({ graph, etag: '"rev-1"' }, link).subscribe(result => {
          expect(result.graph.connections).toEqual([link]);
          expect(result.graph.walls).toEqual(graph.walls);
          expect(result.graph.doors).toEqual(graph.doors);
        });
        const call = http.expectOne({ method: 'PUT', url: base + '/map-a/versions/draft-a/graph' });
        expect(call.request.headers.get('If-Match')).toBe('"rev-1"');
        expect(call.request.body).toEqual({ nodes: graph.nodes, destinations: graph.destinations,
          connections: [link], walls: graph.walls, doors: graph.doors });
        call.flush({ ...graph, connections: [link] }, { headers: { ETag: '"rev-2"' } });
      }
    }
  });
});

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { EditorGraph, PlanBounds } from './graph-model';
import { GraphEditorState } from './graph-editor-state';
import { MapEditorApiService, classifySaveError } from './map-editor-api.service';

const plan: PlanBounds = { floorId: 'f1', planVersionId: 'p1', widthUnits: 100, heightUnits: 60, metersPerUnit: 0.5 };
const empty: EditorGraph = { nodes: [], connections: [], destinations: [] };

function session() {
  let counter = 0;
  const state = new GraphEditorState(() => `id-${++counter}`);
  state.load(empty, [plan]);
  return state;
}

describe('GraphEditorState', () => {
  it('starts on the first plan floor, clean and without history', () => {
    const state = session();
    expect(state.floorId()).toBe('f1');
    expect(state.dirty()).toBe(false);
    expect(state.canUndo()).toBe(false);
  });

  it('adds a node with the node tool, selects it and marks the draft dirty', () => {
    const state = session();
    state.setTool('node');
    state.canvasClick(10, 20);
    expect(state.floorNodes()).toHaveLength(1);
    expect(state.selectedNode()?.id).toBe('id-1');
    expect(state.dirty()).toBe(true);
  });

  it('ignores canvas clicks for other tools but clears selection with select', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(1, 1);
    state.setTool('select'); state.canvasClick(5, 5);
    expect(state.floorNodes()).toHaveLength(1);
    expect(state.selection()).toBeNull();
  });

  it('connects two nodes in two clicks and explains rejected links', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0); state.canvasClick(10, 0);
    state.setTool('edge');
    state.nodeClick('id-1');
    expect(state.pendingFrom()).toBe('id-1');
    state.nodeClick('id-1');
    expect(state.feedback()).toContain('dos nodos distintos');
    state.nodeClick('id-1'); state.nodeClick('id-2');
    expect(state.floorConnections()).toHaveLength(1);
    expect(state.selectedConnection()).not.toBeNull();
    state.nodeClick('id-2'); state.nodeClick('id-1');
    expect(state.feedback()).toContain('Ya existe una conexión');
  });

  it('turns a node into a destination with the destination tool and saves its entry', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0);
    state.setTool('destination'); state.nodeClick('id-1');
    expect(state.selectedNode()?.type).toBe('DESTINATION');
    state.saveDestination('id-1', { type: 'SERVICE', name: 'Caja', specialty: null });
    expect(state.selectedDestination()?.name).toBe('Caja');
  });

  it('undoes and redoes edits and drops a stale selection', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0);
    state.undo();
    expect(state.floorNodes()).toHaveLength(0);
    expect(state.selection()).toBeNull();
    expect(state.dirty()).toBe(false);
    state.redo();
    expect(state.floorNodes()).toHaveLength(1);
    expect(state.canRedo()).toBe(false);
  });

  it('moves nodes within bounds and does not record no-op moves', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(10, 10);
    state.moveTo('id-1', 500, 10);
    expect(state.floorNodes()[0].x).toBe(100);
    state.moveTo('id-1', 100, 10);
    state.undo();
    // The no-op move was not recorded, so undo reverts the real move instead.
    expect(state.floorNodes()[0].x).toBe(10);
    expect(state.canUndo()).toBe(true);
  });

  it('deletes the selection with its dependants', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0); state.canvasClick(10, 0);
    state.setTool('edge'); state.nodeClick('id-1'); state.nodeClick('id-2');
    state.select({ kind: 'node', id: 'id-1' });
    state.deleteSelection();
    expect(state.graph().connections).toEqual([]);
    expect(state.graph().nodes).toHaveLength(1);
  });

  it('refuses to apply a generated proposal without a confirmed scale', () => {
    const state = new GraphEditorState();
    state.load(empty, [{ ...plan, metersPerUnit: null }]);
    expect(state.applyGenerated({ zones: [], nodes: [], connections: [], wallCandidates: [], warnings: [] })).toBe(false);
    state.load(empty, [plan]);
    expect(state.applyGenerated({ zones: [], nodes: [{ id: 'a', label: 'A', x: 1, y: 1 }], connections: [], wallCandidates: [], warnings: [] })).toBe(true);
    expect(state.graph().nodes).toHaveLength(1);
  });

  it('becomes clean again after loading the saved snapshot', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0);
    state.load(state.graph(), [plan]);
    expect(state.dirty()).toBe(false);
    expect(state.canUndo()).toBe(false);
  });
});

describe('draft API contract', () => {
  let api: MapEditorApiService;
  let http: HttpTestingController;
  const base = environment.apiUrl + '/sites/s1/maps';
  const body = {
    siteId: 's1', mapId: 'm1', modelVersionId: 'v1', status: 'DRAFT',
    plans: [{ floorId: 'f1', planVersionId: 'p1', widthUnits: 100, heightUnits: 60, metersPerUnit: null }],
    nodes: [], connections: [], destinations: []
  };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MapEditorApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads the site draft with its ETag and treats a missing draft as null', () => {
    api.load('s1').subscribe(snapshot => expect(snapshot).toMatchObject({ etag: '"rev-3"', mapId: 'm1', plans: [{ metersPerUnit: null }] }));
    http.expectOne({ method: 'GET', url: base + '/draft/graph' }).flush(body, { headers: { ETag: '"rev-3"' } });
    api.load('s1').subscribe(snapshot => expect(snapshot).toBeNull());
    http.expectOne(base + '/draft/graph').flush(null, { status: 404, statusText: 'Not Found' });
  });

  it('replaces the whole graph with If-Match and returns the next revision', () => {
    const snapshot = { siteId: 's1', mapId: 'm1', modelVersionId: 'v1', etag: '"rev-3"', plans: [], graph: { nodes: [], connections: [], destinations: [{ id: 'd', nodeId: 'n', type: 'SERVICE', name: 'Caja', specialty: null }] } };
    api.save(snapshot, snapshot.graph).subscribe(next => expect(next.etag).toBe('"rev-4"'));
    const call = http.expectOne({ method: 'PUT', url: base + '/m1/versions/v1/graph' });
    expect(call.request.headers.get('If-Match')).toBe('"rev-3"');
    expect(Object.keys(call.request.body)).toEqual(['nodes', 'connections', 'destinations']);
    call.flush(body, { headers: { ETag: '"rev-4"' } });
  });

  it('rejects incomplete snapshots', () => {
    api.load('s1').subscribe({ error: error => expect(error.message).toContain('Incomplete') });
    http.expectOne(base + '/draft/graph').flush({ ...body, status: 'PUBLISHED' }, { headers: { ETag: '"rev-1"' } });
  });
});

describe('save failures', () => {
  it('classifies every documented status', () => {
    const failure = (status: number, error?: unknown) => classifySaveError(new HttpErrorResponse({ status, error }));
    expect(failure(412, { code: 'STALE_DRAFT_GRAPH' }).kind).toBe('stale');
    expect(failure(409).kind).toBe('not-draft');
    expect(failure(0).kind).toBe('offline');
    expect(failure(403).kind).toBe('forbidden');
    expect(failure(404).kind).toBe('missing');
    expect(failure(500).kind).toBe('other');
    const invalid = failure(422, { code: 'INVALID_MAP_GRAPH', issues: [{ code: 'DISCONNECTED_NODE', elementType: 'NODE', elementId: 'n', message: 'x' }] });
    expect(invalid.kind).toBe('invalid');
    expect(invalid.issues[0]).toMatchObject({ elementId: 'n', severity: 'error' });
    expect(invalid.message).toContain('1 problema');
  });
});

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { EditorGraph, PlanBounds } from '../../domain/model/graph-model';
import { GraphEditorState } from '../../application/graph-editor-state';
import { MapEditorApiService, classifySaveError } from '../../infrastructure/map-editor-api.service';

const plan: PlanBounds = { floorId: 'f1', planVersionId: 'p1', widthUnits: 100, heightUnits: 60, metersPerUnit: 0.5 };
const empty: EditorGraph = { nodes: [], connections: [], destinations: [] };

function session() {
  let counter = 0;
  const state = new GraphEditorState(() => `id-${++counter}`);
  state.load(empty, [plan]);
  return state;
}

describe('GraphEditorState', () => {
  it('creates, edits, moves and removes a wall and its door with undo and redo', () => {
    const state = session();
    state.setTool('wall'); state.canvasClick(20, 10); state.canvasClick(20, 50);
    const wall = state.selectedWall();
    expect(wall).not.toBeNull();
    state.setTool('door'); state.wallClick(wall!.id, 0.5);
    const door = state.selectedDoor();
    expect(door?.wallId).toBe(wall!.id);
    state.updateDoor(door!.id, 0.3, 0.6);
    state.updateWall(wall!.id, { x1: 30, y1: 10, x2: 30, y2: 50 });
    expect(state.selectedWall()).toBeNull();
    expect(state.floorWalls()[0].x1).toBe(30);
    state.undo();
    expect(state.floorWalls()[0].x1).toBe(20);
    state.redo();
    expect(state.floorWalls()[0].x1).toBe(30);
    state.select({ kind: 'wall', id: wall!.id }); state.deleteSelection();
    expect(state.floorWalls()).toHaveLength(0);
    expect(state.floorDoors()).toHaveLength(0);
  });
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

  it('reconnects an existing arista in one undoable edit and keeps its selection', () => {
    const state = session();
    state.setTool('node');
    state.canvasClick(0, 0); state.canvasClick(10, 0); state.canvasClick(30, 0);
    state.setTool('edge'); state.nodeClick('id-1'); state.nodeClick('id-2');
    const linkId = state.selectedConnection()?.id;
    state.beginReconnect('target');
    expect(state.tool()).toBe('reconnect');
    state.nodeClick('id-3');
    expect(state.selectedConnection()).toMatchObject({ id: linkId, targetNodeId: 'id-3', distanceMeters: 15 });
    expect(state.tool()).toBe('select');
    state.undo();
    expect(state.selectedConnection()).toMatchObject({ id: linkId, targetNodeId: 'id-2' });
  });

  it('keeps reconnection pending after a rejected target and cancels cleanly', () => {
    const state = session();
    state.setTool('node'); state.canvasClick(0, 0); state.canvasClick(10, 0);
    state.setTool('edge'); state.nodeClick('id-1'); state.nodeClick('id-2');
    state.beginReconnect('target'); state.nodeClick('id-1');
    expect(state.feedback()).toContain('dos nodos distintos');
    expect(state.reconnecting()).not.toBeNull();
    state.cancelReconnect();
    expect(state.reconnecting()).toBeNull();
    expect(state.selectedConnection()?.targetNodeId).toBe('id-2');
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

  it('round-trips versioned wall and door geometry through the draft API', () => {
    const wall = { id: 'w1', floorId: 'f1', planVersionId: 'p1', x1: 20, y1: 0, x2: 20, y2: 60 };
    const door = { id: 'd1', wallId: 'w1', from: .4, to: .6 };
    api.load('s1').subscribe(snapshot => {
      expect(snapshot?.graph.walls).toEqual([wall]);
      expect(snapshot?.graph.doors).toEqual([door]);
      if (snapshot) {
        api.save(snapshot, snapshot.graph).subscribe(next => {
          expect(next.graph.walls).toEqual([wall]);
          expect(next.graph.doors).toEqual([door]);
        });
      }
    });
    http.expectOne(base + '/draft/graph').flush({ ...body, walls: [wall], doors: [door] },
      { headers: { ETag: '"rev-0"' } });
    const save = http.expectOne(base + '/m1/versions/v1/graph');
    expect(save.request.body.walls).toEqual([wall]);
    expect(save.request.body.doors).toEqual([door]);
    save.flush({ ...body, walls: [wall], doors: [door] }, { headers: { ETag: '"rev-1"' } });
  });

  it('replaces the whole graph with If-Match and returns the next revision', () => {
    const snapshot = { siteId: 's1', mapId: 'm1', modelVersionId: 'v1', etag: '"rev-3"', plans: [], graph: { nodes: [], connections: [], destinations: [{ id: 'd', nodeId: 'n', type: 'SERVICE', name: 'Caja', specialty: null }] } };
    api.save(snapshot, snapshot.graph).subscribe(next => expect(next.etag).toBe('"rev-4"'));
    const call = http.expectOne({ method: 'PUT', url: base + '/m1/versions/v1/graph' });
    expect(call.request.headers.get('If-Match')).toBe('"rev-3"');
    expect(Object.keys(call.request.body)).toEqual(['nodes', 'connections', 'walls', 'doors', 'destinations']);
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

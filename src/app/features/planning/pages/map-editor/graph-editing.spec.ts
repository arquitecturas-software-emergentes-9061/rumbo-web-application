import {
  EMPTY_GRAPH, EditorGraph, PlanBounds, addConnection, addNode, applyProposal, distanceMeters, moveNode, removeConnection,
  removeNode, updateConnection, updateNodeType, upsertDestination
} from './graph-model';
import { countErrors, fromServerIssues, validateGraph } from './graph-validation';
import { GraphHistory } from './graph-history';

const plan: PlanBounds = { floorId: 'f1', planVersionId: 'p1', widthUnits: 100, heightUnits: 60, metersPerUnit: 0.5 };
const other: PlanBounds = { floorId: 'f2', planVersionId: 'p2', widthUnits: 100, heightUnits: 60, metersPerUnit: 0.5 };

function build(): EditorGraph {
  let graph = addNode(EMPTY_GRAPH, plan, 0, 0, 'ACCESS', 'a');
  graph = addNode(graph, plan, 10, 0, 'INTERSECTION', 'b');
  graph = addNode(graph, plan, 20, 0, 'DESTINATION', 'c');
  graph = addConnection(graph, 'a', 'b', [plan], 'ab').graph;
  graph = addConnection(graph, 'b', 'c', [plan], 'bc').graph;
  return upsertDestination(graph, 'c', { type: 'SERVICE', name: 'Caja', specialty: null }, 'd1');
}
const codes = (graph: EditorGraph, plans = [plan]) => validateGraph(graph, plans).map(alert => alert.code);

describe('graph editing operations', () => {
  it('adds nodes inside the plan and moves them clamped to its bounds', () => {
    const graph = addNode(EMPTY_GRAPH, plan, 150, -5, 'ACCESS', 'n');
    expect(graph.nodes[0]).toMatchObject({ id: 'n', floorId: 'f1', planVersionId: 'p1', x: 100, y: 0, type: 'ACCESS' });
    expect(moveNode(graph, 'n', plan, 12.345, 70).nodes[0]).toMatchObject({ x: 12.35, y: 60 });
  });

  it('measures distances with the confirmed scale and never returns zero', () => {
    expect(distanceMeters({ x: 0, y: 0 }, { x: 30, y: 40 }, plan)).toBe(25);
    expect(distanceMeters({ x: 0, y: 0 }, { x: 0, y: 0 }, plan)).toBe(0.01);
    expect(distanceMeters({ x: 0, y: 0 }, { x: 3, y: 4 }, null)).toBe(5);
  });

  it('creates bidirectional corridors and rejects loops, duplicates and cross-floor links', () => {
    const graph = build();
    expect(graph.connections[0]).toMatchObject({ type: 'CORRIDOR', bidirectional: true, verticalPenalty: 0, distanceMeters: 5, weight: 5 });
    expect(addConnection(graph, 'a', 'a', [plan]).rejected).toBe('SAME_NODE');
    expect(addConnection(graph, 'b', 'a', [plan]).rejected).toBe('DUPLICATE');
    expect(addConnection(graph, 'a', 'zzz', [plan]).rejected).toBe('MISSING_NODE');
    const crossed = addNode(graph, other, 5, 5, 'INTERSECTION', 'x');
    expect(addConnection(crossed, 'a', 'x', [plan, other]).rejected).toBe('DIFFERENT_FLOOR');
  });

  it('removing a node cascades to its connections and directory entry', () => {
    const graph = removeNode(build(), 'c');
    expect(graph.nodes.map(node => node.id)).toEqual(['a', 'b']);
    expect(graph.connections.map(item => item.id)).toEqual(['ab']);
    expect(graph.destinations).toEqual([]);
  });

  it('changing a destination node to another type drops its directory entry', () => {
    expect(updateNodeType(build(), 'c', 'INTERSECTION').destinations).toEqual([]);
    expect(updateNodeType(build(), 'c', 'DESTINATION').destinations).toHaveLength(1);
  });

  it('upserts a single directory entry per node and trims input', () => {
    const graph = upsertDestination(build(), 'c', { type: 'DOCTOR', name: '  Dra. Núñez ', specialty: ' Cardiología ' });
    expect(graph.destinations).toEqual([{ id: 'd1', nodeId: 'c', type: 'DOCTOR', name: 'Dra. Núñez', specialty: 'Cardiología' }]);
    expect(upsertDestination(graph, 'c', { type: 'DOCTOR', name: 'X', specialty: '  ' }).destinations[0].specialty).toBeNull();
  });

  it('updates and removes connections', () => {
    const graph = updateConnection(build(), 'ab', { type: 'DOORWAY', accessibility: 'ACCESSIBLE' });
    expect(graph.connections[0]).toMatchObject({ type: 'DOORWAY', accessibility: 'ACCESSIBLE' });
    expect(removeConnection(graph, 'ab').connections.map(item => item.id)).toEqual(['bc']);
  });

  it('applies a proposal to one floor only, keeping other floors', () => {
    const base = addNode(build(), other, 1, 1, 'INTERSECTION', 'keep');
    let counter = 0;
    const proposal = {
      zones: [], wallCandidates: [], warnings: [],
      nodes: [{ id: 'p1', label: 'N1', x: 0, y: 0 }, { id: 'p2', label: 'N2', x: 20, y: 0 }],
      connections: [{ id: 'k', fromNodeId: 'p1', toNodeId: 'p2', distanceUnits: 20 }, { id: 'bad', fromNodeId: 'p1', toNodeId: 'nope', distanceUnits: 1 }]
    };
    const next = applyProposal(base, proposal, plan, () => `id-${++counter}`);
    // 'a' and 'b' are replaced; the destination 'c' and the node of another floor survive. The
    // proposal node next to 'c' is merged into it, so only one new node is created.
    expect(next.nodes.map(node => node.id).sort()).toEqual(['c', 'id-1', 'keep']);
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0]).toMatchObject({ type: 'DOORWAY', distanceMeters: 10, targetNodeId: 'c' });
    expect(next.destinations.map(entry => entry.nodeId)).toEqual(['c']);
  });

  it('keeps destinations and their directory entries after regenerating a floor', () => {
    const proposal = { zones: [], wallCandidates: [], warnings: [], nodes: [{ id: 'p1', label: 'N1', x: 200, y: 5 }], connections: [] };
    const next = applyProposal(build(), proposal, plan, () => 'new');
    expect(next.nodes.find(node => node.id === 'c')).toMatchObject({ type: 'DESTINATION', x: 20 });
    expect(next.destinations).toEqual([expect.objectContaining({ id: 'd1', nodeId: 'c', name: 'Caja' })]);
    // No access node remains after regeneration, so the author is asked to mark one.
    expect(codes(next)).toContain('MISSING_ACCESS');
  });

  it('reuses a kept destination when a proposal node lands next to it', () => {
    const proposal = {
      zones: [], wallCandidates: [], warnings: [],
      nodes: [{ id: 'p1', label: 'N1', x: 20.5, y: 0.5 }, { id: 'p2', label: 'N2', x: 60, y: 0 }],
      connections: [{ id: 'k', fromNodeId: 'p1', toNodeId: 'p2', distanceUnits: 40 }]
    };
    let counter = 0;
    const next = applyProposal(build(), proposal, plan, () => `id-${++counter}`);
    expect(next.nodes.filter(node => node.type === 'DESTINATION')).toHaveLength(1);
    expect(next.nodes).toHaveLength(2);
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0]).toMatchObject({ sourceNodeId: 'c', type: 'DOORWAY' });
    expect(next.destinations[0].nodeId).toBe('c');
  });
});

describe('graph validation', () => {
  it('accepts a connected graph with a reachable, documented destination', () => {
    expect(codes(build())).toEqual([]);
  });

  it('reports empty graphs and missing access or destination nodes', () => {
    expect(codes(EMPTY_GRAPH)).toEqual(['EMPTY_GRAPH']);
    const only = addNode(EMPTY_GRAPH, plan, 1, 1, 'INTERSECTION', 'n');
    expect(codes(only)).toEqual(expect.arrayContaining(['MISSING_ACCESS', 'MISSING_DESTINATION']));
  });

  it('flags nodes disconnected from the first access node', () => {
    const graph = addNode(build(), plan, 50, 50, 'INTERSECTION', 'island');
    const alerts = validateGraph(graph, [plan]);
    expect(alerts).toContainEqual(expect.objectContaining({ code: 'DISCONNECTED_NODE', elementId: 'island', severity: 'error' }));
  });

  it('flags destinations that only exist in the wrong direction', () => {
    const graph = updateConnection(updateConnection(build(), 'bc', { bidirectional: false }), 'ab', { bidirectional: false });
    const flipped: EditorGraph = { ...graph, connections: graph.connections.map(item => item.id === 'bc' ? { ...item, sourceNodeId: 'c', targetNodeId: 'b' } : item) };
    expect(codes(flipped)).toContain('UNREACHABLE_DESTINATION');
  });

  it('flags a destination without directory entry as a warning and a missing scale', () => {
    const noEntry: EditorGraph = { ...build(), destinations: [] };
    const alerts = validateGraph(noEntry, [{ ...plan, metersPerUnit: null }]);
    expect(alerts).toContainEqual(expect.objectContaining({ code: 'MISSING_DESTINATION_ENTRY', severity: 'warning' }));
    expect(alerts).toContainEqual(expect.objectContaining({ code: 'MISSING_SCALE', severity: 'warning' }));
    expect(countErrors(alerts)).toBe(0);
  });

  it('flags duplicate links, invalid data and cross-floor corridors', () => {
    const base = build();
    const duplicate: EditorGraph = { ...base, connections: [...base.connections, { ...base.connections[0], id: 'dup', sourceNodeId: 'b', targetNodeId: 'a' }] };
    expect(codes(duplicate)).toContain('DUPLICATE_CONNECTION');
    expect(codes(updateConnection(base, 'ab', { distanceMeters: 0 }))).toContain('INVALID_CONNECTION_DATA');
    const crossed = addNode(base, other, 1, 1, 'INTERSECTION', 'x');
    const bad: EditorGraph = { ...crossed, connections: [...crossed.connections, { ...base.connections[0], id: 'v', sourceNodeId: 'a', targetNodeId: 'x' }] };
    expect(codes(bad, [plan, other])).toContain('INVALID_VERTICAL_CONNECTION');
  });

  it('maps server issues onto editor alerts', () => {
    const alerts = fromServerIssues([
      { code: 'DISCONNECTED_NODE', elementType: 'NODE', elementId: 'n', message: 'raw' },
      { code: 'SOMETHING_NEW', elementType: 'GRAPH', elementId: null, message: 'Detalle del servidor' }
    ]);
    expect(alerts[0]).toMatchObject({ severity: 'error', elementId: 'n', message: expect.stringContaining('fuera del grafo') });
    expect(alerts[1].message).toBe('Detalle del servidor');
    expect(fromServerIssues(undefined)).toEqual([]);
  });
});

describe('graph history', () => {
  it('undoes and redoes snapshots and drops the redo branch on a new edit', () => {
    const history = new GraphHistory<number>();
    history.record(1);
    history.record(2);
    expect(history.undo(3)).toBe(2);
    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBeNull();
    expect(history.redo(1)).toBe(2);
    expect(history.canRedo).toBe(true);
    history.record(9);
    expect(history.canRedo).toBe(false);
  });

  it('keeps at most the configured number of snapshots', () => {
    const history = new GraphHistory<number>(2);
    [1, 2, 3].forEach(value => history.record(value));
    expect(history.undo(4)).toBe(3);
    expect(history.undo(3)).toBe(2);
    expect(history.undo(2)).toBeNull();
  });
});

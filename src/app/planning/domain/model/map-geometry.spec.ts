import { crossingConflicts, proposalGeometry } from './map-geometry';
import { EditorGraph, PlanBounds } from './map-graph.types';
import { ModelProposal } from './plan-interpretation';

const plan: PlanBounds = { floorId: 'floor', planVersionId: 'plan', widthUnits: 100,
  heightUnits: 60, metersPerUnit: .5 };
const graph: EditorGraph = {
  nodes: [
    { id: 'a', floorId: 'floor', planVersionId: 'plan', x: 20, y: 30, type: 'INTERSECTION' },
    { id: 'b', floorId: 'floor', planVersionId: 'plan', x: 80, y: 30, type: 'INTERSECTION' }
  ],
  connections: [{ id: 'link', sourceNodeId: 'a', targetNodeId: 'b', type: 'DOORWAY',
    distanceMeters: 30, weight: 30, verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true }],
  destinations: []
};
const proposal: ModelProposal = { zones: [], nodes: [], connections: [], warnings: [],
  wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }], doors: [] };

describe('proposal geometry review', () => {
  it('retains a recognized wall even when it exposes an invalid crossing', () => {
    let id = 0;
    const geometry = proposalGeometry(proposal, plan, graph, () => `g-${++id}`);
    expect(geometry.walls).toHaveLength(1);
    const conflicts = crossingConflicts({ ...graph, ...geometry });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('La conexión 1 cruza el muro 1');
    expect(conflicts[0]).not.toContain('link');
    expect(conflicts[0]).not.toContain(geometry.walls[0].id);
  });

  it('describes a doorway without an opening in plain language', () => {
    const wall = { id: 'wall-uuid', floorId: 'floor', planVersionId: 'plan', x1: 10, y1: 0, x2: 10, y2: 60 };
    const [message] = crossingConflicts({ ...graph, walls: [wall], doors: [] });
    expect(message).toContain('La conexión 1 está configurada como «Puerta»');
    expect(message).not.toContain('link');
    expect(message).not.toContain('DOORWAY');
  });

  it('associates a door to the nearest compatible wall once and resolves DOORWAY crossing', () => {
    let id = 0;
    const withDoor = { ...proposal, doors: [{ id: 'recognized-door', x1: 50, y1: 25, x2: 50, y2: 35 }] };
    const geometry = proposalGeometry(withDoor, plan, graph, () => `g-${++id}`);
    expect(geometry.doors).toMatchObject([{ wallId: geometry.walls[0].id, from: 25 / 60, to: 35 / 60 }]);
    expect(geometry.issues).toEqual([]);
    expect(crossingConflicts({ ...graph, ...geometry })).toEqual([]);
    expect(proposalGeometry(withDoor, plan, { ...graph, ...geometry }, () => `g-${++id}`).doors).toHaveLength(1);
  });

  it('reports doors without a matching wall without hiding their candidate', () => {
    const withDoor = { ...proposal, doors: [{ id: 'unmatched', x1: 10, y1: 5, x2: 10, y2: 15 }] };
    const geometry = proposalGeometry(withDoor, plan, graph, () => 'g');
    expect(geometry.walls).toHaveLength(1);
    expect(geometry.issues).toMatchObject([{ code: 'UNMATCHED_DOOR' }]);
    expect(withDoor.doors).toHaveLength(1);
  });

  it('reports ambiguous door-to-wall associations for manual correction', () => {
    const withDoor = { ...proposal,
      wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }, { x1: 50, y1: 10, x2: 50, y2: 50 }],
      doors: [{ id: 'ambiguous', x1: 50, y1: 25, x2: 50, y2: 35 }] };
    let id = 0;
    const geometry = proposalGeometry(withDoor, plan, graph, () => `g-${++id}`);
    expect(geometry.walls).toHaveLength(2);
    expect(geometry.doors).toHaveLength(0);
    expect(geometry.issues).toMatchObject([{ code: 'AMBIGUOUS_DOOR' }]);
  });
});

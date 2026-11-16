import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { reconcilePlanProposal } from './reconcile-plan-proposal';

describe('reconcile plan proposal use case', () => {
  const plan: PlanBounds = { floorId: 'floor-a', planVersionId: 'plan-v2', widthUnits: 100,
    heightUnits: 100, metersPerUnit: 1 };
  const existing: EditorGraph = {
    nodes: [
      { id: 'saved-room-node', floorId: 'floor-a', planVersionId: 'plan-v1', x: 10, y: 10, type: 'DESTINATION' },
      { id: 'remote-node', floorId: 'floor-b', planVersionId: 'plan-b', x: 10, y: 10, type: 'VERTICAL_LINK' }
    ],
    connections: [{ id: 'vertical', sourceNodeId: 'saved-room-node', targetNodeId: 'remote-node',
      type: 'ELEVATOR', distanceMeters: 4, weight: 9, verticalPenalty: 5,
      accessibility: 'ACCESSIBLE', bidirectional: true }],
    destinations: [{ id: 'destination', nodeId: 'saved-room-node', type: 'SERVICE',
      name: 'Cardiología', specialty: 'Cardiología' }],
    walls: [{ id: 'remote-wall', floorId: 'floor-b', planVersionId: 'plan-b', x1: 0, y1: 0, x2: 0, y2: 20 }],
    doors: []
  };

  it('retains reliable environment data, destinations, vertical links and every other floor element', () => {
    const result = reconcilePlanProposal(model('old-zone', 'Cardiología', 'SERVICE', 0),
      model('detected', 'ROOM 1', 'ROOM', 1), existing, plan);

    expect(result.requiresManualReview).toBe(false);
    expect(result.proposal.zones[0]).toMatchObject({ id: 'saved-room-node', name: 'Cardiología', category: 'SERVICE' });
    expect(result.graph.destinations).toContainEqual(expect.objectContaining({ id: 'destination', nodeId: 'saved-room-node' }));
    expect(result.graph.connections).toContainEqual(expect.objectContaining({ id: 'vertical', type: 'ELEVATOR' }));
    expect(result.graph.nodes).toContainEqual(expect.objectContaining({ id: 'remote-node', floorId: 'floor-b' }));
    expect(result.graph.walls).toContainEqual(expect.objectContaining({ id: 'remote-wall', floorId: 'floor-b' }));
  });

  it('does not delete or reassign dependent data when replacement identity is uncertain', () => {
    const result = reconcilePlanProposal(model('old-zone', 'Cardiología', 'SERVICE', 0),
      model('unrelated', 'Farmacia', 'SERVICE', 70), existing, plan);

    expect(result.requiresManualReview).toBe(true);
    expect(result.review.find(item => item.previousZoneIds.includes('old-zone'))).toEqual(expect.objectContaining({
      change: 'UNMATCHED', destinationIds: ['destination'], verticalConnectionIds: ['vertical']
    }));
    expect(result.graph.nodes).toContainEqual(expect.objectContaining({ id: 'saved-room-node' }));
    expect(result.graph.destinations).toContainEqual(expect.objectContaining({ id: 'destination', nodeId: 'saved-room-node' }));
    expect(result.graph.connections).toContainEqual(expect.objectContaining({ id: 'vertical' }));
  });
});

function model(id: string, name: string, category: string, x: number): ModelProposal {
  return { zones: [{ id, name, category, x, y: 0, width: 20, height: 20 }],
    nodes: [{ id, label: name, role: 'DESTINATION', x: x + 10, y: 10 }],
    connections: [], wallCandidates: [], warnings: [] };
}

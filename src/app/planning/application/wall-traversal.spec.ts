import { EditorGraph, GraphConnection, GraphNode } from '../domain/model/map-graph.types';
import { validateGraph, validateFloorProposal } from '../domain/model/graph-validation';

const plan = { floorId: 'f', planVersionId: 'p', widthUnits: 100, heightUnits: 100, metersPerUnit: 1 };
function graph(source: number[], target: number[], type = 'CORRIDOR'): EditorGraph {
  const node = (id: string, point: number[], type: string): GraphNode =>
    ({ id, floorId: 'f', planVersionId: 'p', x: point[0], y: point[1], type });
  const link: GraphConnection = { id: 'link', sourceNodeId: 'a', targetNodeId: 'b', type,
    distanceMeters: 60, weight: 60, verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true };
  return { nodes: [node('a', source, 'ACCESS'), node('b', target, 'DESTINATION')], connections: [link],
    destinations: [], walls: [{ id: 'wall', floorId: 'f', planVersionId: 'p', x1: 50, y1: 0, x2: 50, y2: 100 }],
    doors: [{ id: 'door', wallId: 'wall', from: .4, to: .6 }] };
}
describe('persisted wall traversal validation', () => {
  it('rejects a corridor across a wall even where a door exists', () => {
    expect(validateGraph(graph([20, 50], [80, 50]), [plan])).toContainEqual(
      expect.objectContaining({ code: 'CONNECTION_CROSSES_WALL', elementId: 'link', severity: 'error' }));
  });
  it('permits doorway crossings only at an associated opening', () => {
    const valid = validateGraph(graph([20, 50], [80, 50], 'DOORWAY'), [plan]);
    expect(valid.some(alert => ['CONNECTION_CROSSES_WALL', 'DOORWAY_WITHOUT_OPENING'].includes(alert.code))).toBe(false);
    expect(validateGraph(graph([20, 20], [80, 20], 'DOORWAY'), [plan])).toContainEqual(
      expect.objectContaining({ code: 'CONNECTION_CROSSES_WALL' }));
  });
  it('rejects overlapping links in either direction but permits parallel links', () => {
    for (const points of [[[50, 20], [50, 80]], [[50, 80], [50, 20]]]) {
      expect(validateGraph(graph(points[0], points[1]), [plan])).toContainEqual(
        expect.objectContaining({ code: 'CONNECTION_CROSSES_WALL' }));
    }
    expect(validateGraph(graph([49, 20], [49, 80]), [plan]).some(alert => alert.code === 'CONNECTION_CROSSES_WALL')).toBe(false);
  });
  it('keeps wall validation when checking a floor proposal', () => {
    expect(validateFloorProposal(graph([20, 50], [80, 50]), plan)).toContainEqual(
      expect.objectContaining({ code: 'CONNECTION_CROSSES_WALL' }));
  });
});

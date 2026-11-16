import { EditorGraph, GraphConnection } from './map-graph.types';
import { InvalidVerticalConnection, validateVerticalConnection, verticalConnectionsForFloor } from './vertical-connection';

describe('Vertical connections in a planning graph', () => {
  const graph: EditorGraph = {
    nodes: [
      { id: 'a', floorId: 'floor-a', planVersionId: 'plan-a', x: 1, y: 2, type: 'VERTICAL_LINK' },
      { id: 'b', floorId: 'floor-b', planVersionId: 'plan-b', x: 3, y: 4, type: 'VERTICAL_LINK' },
      { id: 'c', floorId: 'floor-a', planVersionId: 'plan-a', x: 6, y: 7, type: 'DESTINATION' },
    ],
    connections: [], destinations: [{ id: 'd', nodeId: 'c', name: 'Consultorio', type: 'SERVICE', specialty: null }],
    walls: [{ id: 'w', floorId: 'floor-a', planVersionId: 'plan-a', x1: 0, y1: 0, x2: 0, y2: 9 }],
    doors: [{ id: 'door', wallId: 'w', from: .2, to: .3 }],
  };
  const connection: GraphConnection = { id: 'v', sourceNodeId: 'a', targetNodeId: 'b',
    type: 'ELEVATOR', accessibility: 'UNKNOWN', distanceMeters: 4, weight: 6,
    verticalPenalty: 2, bidirectional: true };

  it.each(['ELEVATOR', 'STAIRS', 'RAMP'] as const)('accepts %s with every accessibility classification', type => {
    for (const accessibility of ['UNKNOWN', 'ACCESSIBLE', 'INACCESSIBLE'] as const)
      expect(() => validateVerticalConnection(graph, { ...connection, type, accessibility })).not.toThrow();
  });

  it('locates both ends without interpreting a cross-floor link as a horizontal line', () => {
    const withLink = { ...graph, connections: [connection] };
    expect(verticalConnectionsForFloor(withLink, 'floor-a')[0].local.id).toBe('a');
    expect(verticalConnectionsForFloor(withLink, 'floor-a')[0].remote.id).toBe('b');
    expect(verticalConnectionsForFloor(withLink, 'floor-b')[0].local.id).toBe('b');
    expect(verticalConnectionsForFloor(withLink, 'missing')).toEqual([]);
  });

  it('rejects invalid or duplicate links while allowing an edit of the same ID', () => {
    const withLink = { ...graph, connections: [connection] };
    expect(() => validateVerticalConnection(withLink, { ...connection, weight: 9 })).not.toThrow();
    expect(() => validateVerticalConnection(withLink, { ...connection, id: 'another' }))
      .toThrow(new InvalidVerticalConnection('DUPLICATE'));
    expect(() => validateVerticalConnection(graph, { ...connection, targetNodeId: 'c' }))
      .toThrow(new InvalidVerticalConnection('SAME_FLOOR'));
    expect(() => validateVerticalConnection(graph, { ...connection, verticalPenalty: -1 }))
      .toThrow(new InvalidVerticalConnection('INVALID_MEASURES'));
    expect(() => validateVerticalConnection(graph, { ...connection, targetNodeId: 'gone' }))
      .toThrow(new InvalidVerticalConnection('MISSING_NODE'));
  });
});

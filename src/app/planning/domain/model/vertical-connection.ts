import { EditorGraph, GraphConnection, GraphNode } from './map-graph.types';

export type VerticalConnectionIssue = 'MISSING_NODE' | 'SAME_FLOOR' | 'INVALID_TYPE' |
  'INVALID_MEASURES' | 'DUPLICATE' | 'INVALID_EDIT';

export class InvalidVerticalConnection extends Error {
  constructor(readonly issue: VerticalConnectionIssue) { super(issue); }
}

const verticalTypes = new Set(['ELEVATOR', 'STAIRS', 'RAMP']);
const accessibilities = new Set(['UNKNOWN', 'ACCESSIBLE', 'INACCESSIBLE']);

export function verticalConnectionsForFloor(graph: EditorGraph, floorId: string | null) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  return graph.connections.flatMap(connection => {
    const source = nodes.get(connection.sourceNodeId), target = nodes.get(connection.targetNodeId);
    if (!source || !target || source.floorId === target.floorId) return [];
    if (source.floorId === floorId) return [{ connection, local: source, remote: target }];
    if (target.floorId === floorId) return [{ connection, local: target, remote: source }];
    return [];
  });
}

export function validateVerticalConnection(graph: EditorGraph, connection: GraphConnection): void {
  const nodes = new Map<string, GraphNode>(graph.nodes.map(node => [node.id, node]));
  const source = nodes.get(connection.sourceNodeId), target = nodes.get(connection.targetNodeId);
  if (!source || !target) throw new InvalidVerticalConnection('MISSING_NODE');
  if (source.floorId === target.floorId) throw new InvalidVerticalConnection('SAME_FLOOR');
  if (!verticalTypes.has(connection.type) || !accessibilities.has(connection.accessibility))
    throw new InvalidVerticalConnection('INVALID_TYPE');
  if (![connection.distanceMeters, connection.weight, connection.verticalPenalty,
    connection.weight + connection.verticalPenalty].every(Number.isFinite)
    || connection.distanceMeters <= 0 || connection.weight <= 0 || connection.verticalPenalty < 0)
    throw new InvalidVerticalConnection('INVALID_MEASURES');

  const previous = graph.connections.find(item => item.id === connection.id);
  if (previous && !verticalTypes.has(previous.type)) throw new InvalidVerticalConnection('INVALID_EDIT');
  const duplicate = graph.connections.some(item => item.id !== connection.id && item.type === connection.type && (
    (item.sourceNodeId === connection.sourceNodeId && item.targetNodeId === connection.targetNodeId) ||
    (item.sourceNodeId === connection.targetNodeId && item.targetNodeId === connection.sourceNodeId
      && (item.bidirectional || connection.bidirectional))
  ));
  if (duplicate) throw new InvalidVerticalConnection('DUPLICATE');
}

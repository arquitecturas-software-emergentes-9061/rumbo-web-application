import { EditorGraph, GraphConnection, GraphNode, PlanBounds } from './map-graph.types';

export type ConnectionRejection = 'SAME_NODE' | 'DUPLICATE' | 'MISSING_NODE' | 'DIFFERENT_FLOOR';
export type ConnectionEnd = 'source' | 'target';
export interface ConnectionChange { graph: EditorGraph; rejected?: ConnectionRejection }

function measuredDistance(source: GraphNode, target: GraphNode, plan: PlanBounds): number {
  return Math.max(Math.round(Math.hypot(source.x - target.x, source.y - target.y) *
    (plan.metersPerUnit ?? 1) * 100) / 100, 0.01);
}

/** A manually tuned weight survives geometry edits; an automatic weight follows the measured distance. */
function withDistance(connection: GraphConnection, source: GraphNode, target: GraphNode, plan: PlanBounds): GraphConnection {
  const distanceMeters = measuredDistance(source, target, plan);
  return { ...connection, distanceMeters,
    weight: Math.abs(connection.weight - connection.distanceMeters) < 0.001 ? distanceMeters : connection.weight };
}

/** Replaces exactly one endpoint of an existing same-floor connection, preserving its ID and metadata. */
export function reconnectConnection(graph: EditorGraph, connectionId: string, end: ConnectionEnd,
                                    nodeId: string, plans: PlanBounds[]): ConnectionChange {
  const connection = graph.connections.find(item => item.id === connectionId);
  if (!connection) return { graph, rejected: 'MISSING_NODE' };
  const originalSource = graph.nodes.find(item => item.id === connection.sourceNodeId);
  const originalTarget = graph.nodes.find(item => item.id === connection.targetNodeId);
  if (!originalSource || !originalTarget) return { graph, rejected: 'MISSING_NODE' };
  if (originalSource.floorId !== originalTarget.floorId) return { graph, rejected: 'DIFFERENT_FLOOR' };
  const sourceId = end === 'source' ? nodeId : connection.sourceNodeId;
  const targetId = end === 'target' ? nodeId : connection.targetNodeId;
  if (sourceId === targetId) return { graph, rejected: 'SAME_NODE' };
  const source = graph.nodes.find(item => item.id === sourceId);
  const target = graph.nodes.find(item => item.id === targetId);
  if (!source || !target) return { graph, rejected: 'MISSING_NODE' };
  if (source.floorId !== target.floorId) return { graph, rejected: 'DIFFERENT_FLOOR' };
  if (connection.sourceNodeId === sourceId && connection.targetNodeId === targetId) return { graph };
  const duplicate = graph.connections.some(item => item.id !== connectionId &&
    ((item.sourceNodeId === sourceId && item.targetNodeId === targetId) ||
     (item.sourceNodeId === targetId && item.targetNodeId === sourceId)));
  if (duplicate) return { graph, rejected: 'DUPLICATE' };
  const plan = plans.find(item => item.floorId === source.floorId);
  if (!plan) return { graph, rejected: 'MISSING_NODE' };
  const updated = withDistance({ ...connection, sourceNodeId: sourceId, targetNodeId: targetId }, source, target, plan);
  return { graph: { ...graph, connections: graph.connections.map(item => item.id === connectionId ? updated : item) } };
}

/** Keeps incident same-floor distances in sync when an editor moves a node. */
export function moveGraphNode(graph: EditorGraph, nodeId: string, plan: PlanBounds, x: number, y: number): EditorGraph {
  const node = graph.nodes.find(item => item.id === nodeId);
  if (!node || node.floorId !== plan.floorId) return graph;
  const point = { x: Math.round(Math.min(Math.max(x, 0), plan.widthUnits) * 100) / 100,
    y: Math.round(Math.min(Math.max(y, 0), plan.heightUnits) * 100) / 100 };
  if (node.x === point.x && node.y === point.y) return graph;
  const nodes = graph.nodes.map(item => item.id === nodeId ? { ...item, ...point } : item);
  const byId = new Map(nodes.map(item => [item.id, item]));
  const connections = graph.connections.map(item => {
    if (item.sourceNodeId !== nodeId && item.targetNodeId !== nodeId) return item;
    const source = byId.get(item.sourceNodeId), target = byId.get(item.targetNodeId);
    return source && target && source.floorId === target.floorId ? withDistance(item, source, target, plan) : item;
  });
  return { ...graph, nodes, connections };
}

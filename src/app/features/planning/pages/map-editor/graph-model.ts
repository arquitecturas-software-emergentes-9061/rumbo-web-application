import { GraphConnection, GraphNode } from '../interfloor-connections/draft-graph.service';
import { ModelProposal } from './model-preview';

export type NodeType = 'INTERSECTION' | 'ACCESS' | 'DESTINATION' | 'VERTICAL_LINK' | 'REFERENCE';
export type ConnectionType = 'CORRIDOR' | 'DOORWAY' | 'STAIRS' | 'RAMP' | 'ELEVATOR';
export type DestinationType = 'DOCTOR' | 'SPECIALTY' | 'SERVICE';
export type ConnectionAccessibility = 'UNKNOWN' | 'ACCESSIBLE' | 'INACCESSIBLE';

export const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: 'INTERSECTION', label: 'Intersección' }, { value: 'ACCESS', label: 'Acceso' },
  { value: 'DESTINATION', label: 'Destino' }, { value: 'VERTICAL_LINK', label: 'Conexión vertical' },
  { value: 'REFERENCE', label: 'Referencia' }
];
export const CONNECTION_TYPES: { value: ConnectionType; label: string }[] = [
  { value: 'CORRIDOR', label: 'Pasillo' }, { value: 'DOORWAY', label: 'Puerta' }, { value: 'STAIRS', label: 'Escalera' },
  { value: 'RAMP', label: 'Rampa' }, { value: 'ELEVATOR', label: 'Ascensor' }
];
export const DESTINATION_TYPES: { value: DestinationType; label: string }[] = [
  { value: 'DOCTOR', label: 'Médico' }, { value: 'SPECIALTY', label: 'Especialidad' }, { value: 'SERVICE', label: 'Servicio' }
];

export interface Destination {
  id: string;
  nodeId: string;
  type: string;
  name: string;
  specialty: string | null;
}

export interface PlanBounds {
  floorId: string;
  planVersionId: string;
  widthUnits: number;
  heightUnits: number;
  metersPerUnit: number | null;
}

export interface EditorGraph {
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: Destination[];
}

export const EMPTY_GRAPH: EditorGraph = { nodes: [], connections: [], destinations: [] };

export type IdFactory = () => string;
export const randomId: IdFactory = () => crypto.randomUUID();

const round = (value: number) => Math.round(value * 100) / 100;

export function planFor(plans: PlanBounds[], floorId: string): PlanBounds | null {
  return plans.find(plan => plan.floorId === floorId) ?? null;
}

export function clampPoint(plan: PlanBounds, x: number, y: number) {
  return { x: round(Math.min(Math.max(x, 0), plan.widthUnits)), y: round(Math.min(Math.max(y, 0), plan.heightUnits)) };
}

export function distanceMeters(a: { x: number; y: number }, b: { x: number; y: number }, plan: PlanBounds | null): number {
  const units = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(round(units * (plan?.metersPerUnit ?? 1)), 0.01);
}

export function addNode(graph: EditorGraph, plan: PlanBounds, x: number, y: number,
                        type: NodeType = 'INTERSECTION', id: string = randomId()): EditorGraph {
  const point = clampPoint(plan, x, y);
  const node: GraphNode = { id, floorId: plan.floorId, planVersionId: plan.planVersionId, ...point, type };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function moveNode(graph: EditorGraph, id: string, plan: PlanBounds, x: number, y: number): EditorGraph {
  const point = clampPoint(plan, x, y);
  return { ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, ...point } : node) };
}

/** Changing a node away from DESTINATION also drops its directory entry. */
export function updateNodeType(graph: EditorGraph, id: string, type: NodeType): EditorGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(node => node.id === id ? { ...node, type } : node),
    destinations: type === 'DESTINATION' ? graph.destinations : graph.destinations.filter(entry => entry.nodeId !== id)
  };
}

export function removeNode(graph: EditorGraph, id: string): EditorGraph {
  return {
    nodes: graph.nodes.filter(node => node.id !== id),
    connections: graph.connections.filter(item => item.sourceNodeId !== id && item.targetNodeId !== id),
    destinations: graph.destinations.filter(entry => entry.nodeId !== id)
  };
}

export type ConnectionRejection = 'SAME_NODE' | 'DUPLICATE' | 'MISSING_NODE' | 'DIFFERENT_FLOOR';

export function addConnection(graph: EditorGraph, sourceId: string, targetId: string, plans: PlanBounds[],
                              id: string = randomId()): { graph: EditorGraph; rejected?: ConnectionRejection } {
  if (sourceId === targetId) return { graph, rejected: 'SAME_NODE' };
  const source = graph.nodes.find(node => node.id === sourceId);
  const target = graph.nodes.find(node => node.id === targetId);
  if (!source || !target) return { graph, rejected: 'MISSING_NODE' };
  if (source.floorId !== target.floorId) return { graph, rejected: 'DIFFERENT_FLOOR' };
  const exists = graph.connections.some(item =>
    (item.sourceNodeId === sourceId && item.targetNodeId === targetId) || (item.sourceNodeId === targetId && item.targetNodeId === sourceId));
  if (exists) return { graph, rejected: 'DUPLICATE' };
  const meters = distanceMeters(source, target, planFor(plans, source.floorId));
  const connection: GraphConnection = {
    id, sourceNodeId: sourceId, targetNodeId: targetId, type: 'CORRIDOR', distanceMeters: meters, weight: meters,
    verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true
  };
  return { graph: { ...graph, connections: [...graph.connections, connection] } };
}

export type ConnectionPatch = Partial<Pick<GraphConnection, 'type' | 'distanceMeters' | 'weight' | 'accessibility' | 'bidirectional'>>;

export function updateConnection(graph: EditorGraph, id: string, patch: ConnectionPatch): EditorGraph {
  return { ...graph, connections: graph.connections.map(item => item.id === id ? { ...item, ...patch } : item) };
}

export function removeConnection(graph: EditorGraph, id: string): EditorGraph {
  return { ...graph, connections: graph.connections.filter(item => item.id !== id) };
}

export interface DestinationInput { type: DestinationType; name: string; specialty: string | null }

/** Creates or updates the single directory entry of a DESTINATION node. */
export function upsertDestination(graph: EditorGraph, nodeId: string, input: DestinationInput,
                                  id: string = randomId()): EditorGraph {
  const specialty = input.specialty?.trim() || null;
  const entry = { type: input.type, name: input.name.trim(), specialty };
  const exists = graph.destinations.some(item => item.nodeId === nodeId);
  return {
    ...graph,
    destinations: exists
      ? graph.destinations.map(item => item.nodeId === nodeId ? { ...item, ...entry } : item)
      : [...graph.destinations, { id, nodeId, ...entry }]
  };
}

/**
 * Replaces everything on one floor with the generated proposal. Nodes become intersections joined
 * by doorway connections measured with the confirmed scale, so the caller must have checked it.
 */
export function applyProposal(graph: EditorGraph, proposal: ModelProposal, plan: PlanBounds,
                              newId: IdFactory = randomId): EditorGraph {
  const floorNodeIds = new Set(graph.nodes.filter(node => node.floorId === plan.floorId).map(node => node.id));
  const kept: EditorGraph = {
    nodes: graph.nodes.filter(node => !floorNodeIds.has(node.id)),
    connections: graph.connections.filter(item => !floorNodeIds.has(item.sourceNodeId) && !floorNodeIds.has(item.targetNodeId)),
    destinations: graph.destinations.filter(entry => !floorNodeIds.has(entry.nodeId))
  };
  const ids = new Map<string, string>();
  const nodes: GraphNode[] = proposal.nodes.map(node => {
    const id = newId();
    ids.set(node.id, id);
    return { id, floorId: plan.floorId, planVersionId: plan.planVersionId, ...clampPoint(plan, node.x, node.y), type: 'INTERSECTION' };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const connections: GraphConnection[] = [];
  for (const link of proposal.connections) {
    const source = ids.get(link.fromNodeId), target = ids.get(link.toNodeId);
    if (!source || !target || source === target) continue;
    const meters = distanceMeters(byId.get(source) as GraphNode, byId.get(target) as GraphNode, plan);
    connections.push({
      id: newId(), sourceNodeId: source, targetNodeId: target, type: 'DOORWAY', distanceMeters: meters, weight: meters,
      verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true
    });
  }
  return { nodes: [...kept.nodes, ...nodes], connections: [...kept.connections, ...connections], destinations: kept.destinations };
}

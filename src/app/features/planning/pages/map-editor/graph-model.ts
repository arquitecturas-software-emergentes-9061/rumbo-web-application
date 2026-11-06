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
 * Replaces the generated part of one floor with the proposal while keeping its destinations: every
 * DESTINATION node and its directory entry survive, and a proposal node that lands next to one reuses
 * it instead of creating a duplicate. Other nodes of the floor are replaced. Kept destinations that no
 * proposal link reaches stay unconnected so validation flags them for review. The caller must have
 * checked that the scale is confirmed, because distances are measured in meters.
 */
export function applyProposal(graph: EditorGraph, proposal: ModelProposal, plan: PlanBounds,
                              newId: IdFactory = randomId): EditorGraph {
  const floorNodes = graph.nodes.filter(node => node.floorId === plan.floorId);
  const destinationNodes = floorNodes.filter(node => node.type === 'DESTINATION');
  const removed = new Set(floorNodes.filter(node => node.type !== 'DESTINATION').map(node => node.id));
  const kept: EditorGraph = {
    nodes: graph.nodes.filter(node => !removed.has(node.id)),
    connections: graph.connections.filter(item => !removed.has(item.sourceNodeId) && !removed.has(item.targetNodeId)),
    destinations: graph.destinations.filter(entry => !removed.has(entry.nodeId))
  };
  const snap = Math.max(plan.widthUnits, plan.heightUnits) * 0.02;
  const ids = new Map<string, string>();
  const created: GraphNode[] = [];
  for (const node of proposal.nodes) {
    const point = clampPoint(plan, node.x, node.y);
    const near = destinationNodes.find(existing => Math.hypot(existing.x - point.x, existing.y - point.y) <= snap);
    if (near) { ids.set(node.id, near.id); continue; }
    const id = newId();
    ids.set(node.id, id);
    created.push({ id, floorId: plan.floorId, planVersionId: plan.planVersionId, ...point, type: 'INTERSECTION' });
  }
  const all = [...kept.nodes, ...created];
  const byId = new Map(all.map(node => [node.id, node]));
  const connections = [...kept.connections];
  const linked = new Set(connections.map(item => [item.sourceNodeId, item.targetNodeId].sort().join('|')));
  for (const link of proposal.connections) {
    const source = ids.get(link.fromNodeId), target = ids.get(link.toNodeId);
    if (!source || !target || source === target) continue;
    const key = [source, target].sort().join('|');
    if (linked.has(key)) continue;
    linked.add(key);
    const meters = distanceMeters(byId.get(source) as GraphNode, byId.get(target) as GraphNode, plan);
    connections.push({
      id: newId(), sourceNodeId: source, targetNodeId: target, type: 'DOORWAY', distanceMeters: meters, weight: meters,
      verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true
    });
  }
  return { nodes: all, connections, destinations: kept.destinations };
}

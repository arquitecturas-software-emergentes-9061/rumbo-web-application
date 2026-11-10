import { GraphConnection, GraphNode, EditorGraph, PlanBounds, NodeType, ConnectionType,
  DestinationType } from './map-graph.types';
import { moveGraphNode } from './reconnect-connection';
import { ModelProposal } from './plan-interpretation';

export type { Destination, EditorGraph, PlanBounds, NodeType, ConnectionType, DestinationType,
  ConnectionAccessibility } from './map-graph.types';

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
  return moveGraphNode(graph, id, plan, x, y);
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

const GENERATED_NAME = /^(ROOM|CORRIDOR|SERVICE) \d+$/;

/**
 * Turns a classified zone into a node type: labeled rooms and services become destinations,
 * elevators and stairs become vertical links, and everything else is a plain intersection.
 * Zones still carrying a generated name stay intersections so the directory is not polluted.
 */
export function nodeTypeFor(zone: ModelProposal['zones'][number] | undefined): NodeType {
  if (!zone) return 'INTERSECTION';
  const category = zone.category.toUpperCase();
  if (category === 'ELEVATOR' || category === 'STAIRS') return 'VERTICAL_LINK';
  if ((category === 'ROOM' || category === 'SERVICE') && !GENERATED_NAME.test(zone.name.trim())) return 'DESTINATION';
  return 'INTERSECTION';
}

/** Match only a unique, readable room label to a unique saved directory name on this floor. */
export function reconcileDestinations(graph: EditorGraph, proposal: ModelProposal, plan: PlanBounds) {
  const key = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const existing = graph.destinations.filter(entry => nodes.get(entry.nodeId)?.floorId === plan.floorId);
  const candidates = proposal.zones.filter(zone => nodeTypeFor(zone) === 'DESTINATION'
    && proposal.nodes.some(node => node.id === zone.id && (node.role == null || node.role === 'ROOM' || node.role === 'DESTINATION')));
  const byName = new Map<string, typeof candidates>();
  for (const zone of candidates) byName.set(key(zone.name), [...(byName.get(key(zone.name)) ?? []), zone]);
  const savedByName = new Map<string, typeof existing>();
  for (const entry of existing) savedByName.set(key(entry.name), [...(savedByName.get(key(entry.name)) ?? []), entry]);
  const matches = new Map<string, string>();
  const unresolved: typeof existing = [];
  const ambiguous: typeof existing = [];
  for (const entry of existing) {
    const saved = savedByName.get(key(entry.name)) ?? [];
    const proposed = byName.get(key(entry.name)) ?? [];
    if (saved.length === 1 && proposed.length === 1) matches.set(proposed[0].id, entry.nodeId);
    else {
      unresolved.push(entry);
      if (saved.length > 1 || proposed.length > 1) ambiguous.push(entry);
    }
  }
  return { matches, unresolved, ambiguous };
}

/**
 * Replaces generated geometry on one floor. A unique room/name match retains the saved destination
 * and moves its node to the new plan. Unmatched destinations remain for explicit editor review.
 */
export function applyProposal(graph: EditorGraph, proposal: ModelProposal, plan: PlanBounds,
                              newId: IdFactory = randomId): EditorGraph {
  const floorNodes = graph.nodes.filter(node => node.floorId === plan.floorId);
  const reconciliation = reconcileDestinations(graph, proposal, plan);
  const removed = new Set(floorNodes.filter(node => node.type !== 'DESTINATION').map(node => node.id));
  const moved = new Set(reconciliation.matches.values());
  const kept: EditorGraph = {
    nodes: graph.nodes.filter(node => !removed.has(node.id)),
    connections: graph.connections.filter(item => !removed.has(item.sourceNodeId) && !removed.has(item.targetNodeId)
      && !moved.has(item.sourceNodeId) && !moved.has(item.targetNodeId)),
    destinations: graph.destinations.filter(entry => !removed.has(entry.nodeId))
  };
  const ids = new Map<string, string>();
  const created: GraphNode[] = [];
  const destinations = [...kept.destinations];
  const zoneById = new Map(proposal.zones.map(zone => [zone.id, zone]));
  for (const node of proposal.nodes) {
    const point = clampPoint(plan, node.x, node.y);
    const matched = reconciliation.matches.get(node.id);
    if (matched) { ids.set(node.id, matched); continue; }
    const id = newId();
    const zone = zoneById.get(node.id);
    const type = node.role === 'ENTRANCE' || node.role === 'ACCESS' ? 'ACCESS'
      : node.role === 'DESTINATION' ? 'DESTINATION'
      : node.role === 'VERTICAL_LINK' ? 'VERTICAL_LINK'
      : node.role === 'INTERSECTION' ? 'INTERSECTION' : nodeTypeFor(zone);
    ids.set(node.id, id);
    created.push({ id, floorId: plan.floorId, planVersionId: plan.planVersionId, ...point, type });
    if (type === 'DESTINATION') {
      destinations.push({ id: newId(), nodeId: id, type: 'SERVICE', name: zone?.name ?? node.label, specialty: null });
    }
  }
  const all = [...kept.nodes.map(node => {
    const candidate = proposal.nodes.find(item => reconciliation.matches.get(item.id) === node.id);
    return candidate ? { ...node, planVersionId: plan.planVersionId, ...clampPoint(plan, candidate.x, candidate.y) } : node;
  }), ...created];
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
      id: newId(), sourceNodeId: source, targetNodeId: target,
      type: link.graphType ?? (link.kind === 'CORRIDOR' ? 'CORRIDOR' : 'DOORWAY'),
      distanceMeters: meters,
      weight: link.weight != null && link.distanceMeters != null && Math.abs(link.weight - link.distanceMeters) > 0.001
        ? link.weight : meters,
      verticalPenalty: link.verticalPenalty ?? 0,
      accessibility: link.accessibility ?? 'UNKNOWN', bidirectional: link.bidirectional ?? true
    });
  }
  return { nodes: all, connections, destinations };
}

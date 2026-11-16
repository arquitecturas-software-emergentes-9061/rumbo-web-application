import { reconcileEnvironments, EnvironmentReconciliationItem } from '../domain/model/plan-reconciliation';
import { EditorGraph, GraphNode, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal, ModelZone } from '../domain/model/plan-interpretation';
import { proposalGraphResult } from './proposal-graph';

export interface PlanReconciliationReview extends EnvironmentReconciliationItem {
  destinationIds: string[];
  verticalConnectionIds: string[];
}

export interface ReconciledPlanProposal {
  proposal: ModelProposal;
  graph: EditorGraph;
  warnings: string[];
  review: PlanReconciliationReview[];
  requiresManualReview: boolean;
}

/** Builds a non-persistent replacement proposal while preserving everything outside the regenerated floor. */
export function reconcilePlanProposal(previous: ModelProposal | null, proposed: ModelProposal,
                                      existing: EditorGraph | undefined, plan: PlanBounds): ReconciledPlanProposal {
  if (!previous || !existing) {
    const generated = proposalGraphResult(proposed, plan, existing);
    return { proposal: proposed, graph: mergeFloor(existing, generated.graph, plan, new Set(), new Set()),
      warnings: generated.warnings, review: [], requiresManualReview: false };
  }

  const reconciliation = reconcileEnvironments(previous, proposed);
  const oldZones = new Map(previous.zones.map(zone => [zone.id, zone]));
  const stableIds = new Map<string, string>();
  const unresolvedStableIds = new Set<string>();
  for (const oldId of reconciliation.matches.values()) {
    const node = stableEnvironmentNode(oldZones.get(oldId), existing, plan);
    if (node) stableIds.set(oldId, node.id);
    else if (relatedEnvironmentNodes(oldZones.get(oldId), existing, plan).length) unresolvedStableIds.add(oldId);
  }
  const stableProposal = renameProposal(reconciliation.proposal, stableIds);
  const generated = proposalGraphResult(stableProposal, plan, existing);
  const matchedNodeIds = new Set(stableIds.values());

  const identityReview: EnvironmentReconciliationItem[] = [...unresolvedStableIds].map(oldId => ({
    change: 'AMBIGUOUS', previousZoneIds: [oldId], proposedZoneIds: [oldId],
    reason: 'El ambiente coincide, pero su nodo anterior no puede identificarse de forma única y segura.'
  }));
  const review = [...reconciliation.review, ...identityReview].map(item => {
    const nodes = uniqueById(item.previousZoneIds.flatMap(id => relatedEnvironmentNodes(oldZones.get(id), existing, plan)));
    const nodeIds = new Set(nodes.map(node => node.id));
    return { ...item,
      destinationIds: existing.destinations.filter(destination => nodeIds.has(destination.nodeId))
        .map(destination => destination.id),
      verticalConnectionIds: existing.connections.filter(connection => isVertical(connection.type)
        && (nodeIds.has(connection.sourceNodeId) || nodeIds.has(connection.targetNodeId)))
        .map(connection => connection.id) };
  });
  const protectedNodeIds = new Set(review.flatMap(item => [
    ...item.destinationIds.flatMap(id => existing.destinations.find(destination => destination.id === id)?.nodeId ?? []),
    ...item.verticalConnectionIds.flatMap(id => {
      const connection = existing.connections.find(candidate => candidate.id === id);
      return connection ? [connection.sourceNodeId, connection.targetNodeId] : [];
    })
  ]));
  return { proposal: stableProposal,
    graph: mergeFloor(existing, generated.graph, plan, matchedNodeIds, protectedNodeIds),
    warnings: generated.warnings, review, requiresManualReview: review.length > 0 };
}

function mergeFloor(existing: EditorGraph | undefined, generated: EditorGraph, plan: PlanBounds,
                    matchedNodeIds: ReadonlySet<string>, protectedNodeIds: ReadonlySet<string>): EditorGraph {
  if (!existing) return generated;
  const originalNodes = new Map(existing.nodes.map(node => [node.id, node]));
  const otherFloorNodes = existing.nodes.filter(node => node.floorId !== plan.floorId);
  const protectedNodes = existing.nodes.filter(node => node.floorId === plan.floorId && protectedNodeIds.has(node.id));
  const nodes = uniqueById([...generated.nodes.filter(node => node.floorId === plan.floorId),
    ...otherFloorNodes, ...protectedNodes]);
  const nodeIds = new Set(nodes.map(node => node.id));

  const retainedConnections = existing.connections.filter(connection => {
    const source = originalNodes.get(connection.sourceNodeId), target = originalNodes.get(connection.targetNodeId);
    if (!source || !target) return false;
    const sourceHere = source.floorId === plan.floorId, targetHere = target.floorId === plan.floorId;
    if (!sourceHere && !targetHere) return true;
    if (sourceHere === targetHere || !isVertical(connection.type)) return false;
    const localId = sourceHere ? source.id : target.id;
    return matchedNodeIds.has(localId) || protectedNodeIds.has(localId);
  }).filter(connection => nodeIds.has(connection.sourceNodeId) && nodeIds.has(connection.targetNodeId));
  const connections = uniqueById([...generated.connections.filter(connection => {
    const source = nodes.find(node => node.id === connection.sourceNodeId);
    const target = nodes.find(node => node.id === connection.targetNodeId);
    return source?.floorId === plan.floorId && target?.floorId === plan.floorId;
  }), ...retainedConnections]);

  const destinations = uniqueById([
    ...generated.destinations.filter(destination => {
      const node = nodes.find(candidate => candidate.id === destination.nodeId);
      return node?.floorId === plan.floorId && !existing.destinations.some(saved => saved.nodeId === destination.nodeId);
    }),
    ...existing.destinations.filter(destination => nodeIds.has(destination.nodeId))
  ]);
  return { nodes, connections, destinations, walls: generated.walls, doors: generated.doors };
}

function stableEnvironmentNode(zone: ModelZone | undefined, graph: EditorGraph, plan: PlanBounds): GraphNode | null {
  if (!zone) return null;
  const exact = graph.nodes.find(node => node.id === zone.id && node.floorId === plan.floorId);
  if (exact) return exact;
  const named = graph.destinations.filter(destination => normalize(destination.name) === normalize(zone.name))
    .flatMap(destination => graph.nodes.find(node => node.id === destination.nodeId
      && node.floorId === plan.floorId && contains(zone, node)) ?? []);
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  const structural = graph.nodes.filter(node => node.floorId === plan.floorId
    && (node.type === 'DESTINATION' || node.type === 'VERTICAL_LINK') && contains(zone, node));
  return structural.length === 1 ? structural[0] : null;
}

function relatedEnvironmentNodes(zone: ModelZone | undefined, graph: EditorGraph, plan: PlanBounds): GraphNode[] {
  if (!zone) return [];
  const exact = graph.nodes.find(node => node.id === zone.id && node.floorId === plan.floorId);
  if (exact) return [exact];
  const named = graph.destinations.filter(destination => normalize(destination.name) === normalize(zone.name))
    .flatMap(destination => graph.nodes.find(node => node.id === destination.nodeId && node.floorId === plan.floorId) ?? []);
  const structural = graph.nodes.filter(node => node.floorId === plan.floorId && node.type === 'VERTICAL_LINK'
    && contains(zone, node));
  return uniqueById([...named, ...structural]);
}

function renameProposal(proposal: ModelProposal, ids: ReadonlyMap<string, string>): ModelProposal {
  if (!ids.size) return proposal;
  return { ...proposal,
    zones: proposal.zones.map(zone => ids.has(zone.id) ? { ...zone, id: ids.get(zone.id) as string } : zone),
    nodes: proposal.nodes.map(node => ids.has(node.id) ? { ...node, id: ids.get(node.id) as string } : node),
    connections: proposal.connections.map(connection => ({ ...connection,
      fromNodeId: ids.get(connection.fromNodeId) ?? connection.fromNodeId,
      toNodeId: ids.get(connection.toNodeId) ?? connection.toNodeId })) };
}

function contains(zone: ModelZone, point: { x: number; y: number }): boolean {
  if (!zone.polygon) return point.x >= zone.x && point.x <= zone.x + zone.width
    && point.y >= zone.y && point.y <= zone.y + zone.height;
  return inRing(zone.polygon.outer, point) && !zone.polygon.holes.some(hole => inRing(hole, point));
}

function inRing(ring: { x: number; y: number }[], point: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map(value => [value.id, value])).values()];
}
function isVertical(type: string): boolean { return type === 'STAIRS' || type === 'RAMP' || type === 'ELEVATOR'; }
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

import { distanceMeters, nodeTypeFor } from '../domain/model/graph-model';
import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';

/** Adapts a generated proposal to the same editing interaction used by a draft, without persisting it. */
export function proposalGraph(proposal: ModelProposal, plan: PlanBounds): EditorGraph {
  const zones = new Map(proposal.zones.map(zone => [zone.id, zone]));
  const nodes = proposal.nodes.map(node => ({ id: node.id, floorId: plan.floorId, planVersionId: plan.planVersionId,
    x: node.x, y: node.y, type: node.role === 'ENTRANCE' || node.role === 'ACCESS' ? 'ACCESS'
      : node.role === 'DESTINATION' ? 'DESTINATION' : node.role === 'VERTICAL_LINK' ? 'VERTICAL_LINK'
      : node.role === 'INTERSECTION' ? 'INTERSECTION'
      : nodeTypeFor(zones.get(node.id)) }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const connections = proposal.connections.flatMap(link => {
    const from = byId.get(link.fromNodeId), to = byId.get(link.toNodeId);
    if (!from || !to) return [];
    const meters = distanceMeters(from, to, plan);
    return [{ id: link.id, sourceNodeId: from.id, targetNodeId: to.id,
      type: link.graphType ?? (link.kind === 'CORRIDOR' ? 'CORRIDOR' : 'DOORWAY'),
      distanceMeters: meters, weight: link.weight ?? meters,
      verticalPenalty: link.verticalPenalty ?? 0,
      accessibility: link.accessibility ?? 'UNKNOWN', bidirectional: link.bidirectional ?? true }];
  });
  const destinations = nodes.filter(node => node.type === 'DESTINATION').map(node => ({
    id: `preview-${node.id}`, nodeId: node.id, type: 'SERVICE', name: zones.get(node.id)?.name ?? node.id, specialty: null
  }));
  return { nodes, connections, destinations };
}

/** Keeps labels and recognition metadata while recording node/edge corrections in the proposal. */
export function proposalWithGraph(proposal: ModelProposal, graph: EditorGraph): ModelProposal {
  const originalNodes = new Map(proposal.nodes.map(node => [node.id, node]));
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  return { ...proposal,
    zones: proposal.zones.map(zone => {
      const destination = graph.destinations.find(entry => entry.nodeId === zone.id);
      return destination ? { ...zone, name: destination.name } : zone;
    }),
    nodes: graph.nodes.map(node => ({ ...originalNodes.get(node.id), id: node.id,
      label: graph.destinations.find(entry => entry.nodeId === node.id)?.name ??
        originalNodes.get(node.id)?.label ?? `N-${node.id.slice(0, 4)}`,
      role: node.type === 'ACCESS' ? 'ACCESS' : node.type === 'DESTINATION' ? 'DESTINATION'
        : node.type === 'VERTICAL_LINK' ? 'VERTICAL_LINK' : 'INTERSECTION',
      x: node.x, y: node.y })),
    connections: graph.connections.flatMap(link => {
      const from = byId.get(link.sourceNodeId), to = byId.get(link.targetNodeId);
      if (!from || !to) return [];
      return [{ id: link.id, fromNodeId: from.id, toNodeId: to.id,
        distanceUnits: Math.round(Math.hypot(from.x - to.x, from.y - to.y) * 100) / 100,
        kind: link.type === 'CORRIDOR' ? 'CORRIDOR' : 'DOORWAY', bidirectional: link.bidirectional,
        graphType: link.type as NonNullable<ModelProposal['connections'][number]['graphType']>,
        distanceMeters: link.distanceMeters, weight: link.weight,
        accessibility: link.accessibility, verticalPenalty: link.verticalPenalty }];
    })
  };
}

export function previewPlan(proposal: ModelProposal, floorId: string, planVersionId: string,
                            current: PlanBounds | null): PlanBounds {
  const xs = [...proposal.nodes.map(node => node.x), ...proposal.zones.map(zone => zone.x + zone.width)];
  const ys = [...proposal.nodes.map(node => node.y), ...proposal.zones.map(zone => zone.y + zone.height)];
  return { floorId, planVersionId,
    widthUnits: Math.max(current?.widthUnits ?? 0, ...xs, 100),
    heightUnits: Math.max(current?.heightUnits ?? 0, ...ys, 100),
    metersPerUnit: current?.metersPerUnit ?? 1 };
}

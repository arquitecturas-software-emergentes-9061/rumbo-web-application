import { ModelProposal, ModelZone } from '../domain/model/plan-interpretation';

export interface ProposalSummary { zones: number; nodes: number; connections: number; walls: number; doors: number }

export function summarize(proposal: ModelProposal): ProposalSummary {
  return {
    zones: proposal.zones.length, nodes: proposal.nodes.length,
    connections: proposal.connections.length, walls: proposal.wallCandidates.length, doors: proposal.doors?.length ?? 0
  };
}

export function isEmptyProposal(proposal: ModelProposal): boolean {
  const { zones, nodes, connections, walls, doors } = summarize(proposal);
  return zones + nodes + connections + walls + doors === 0;
}

const GENERATED_NAME = /^(ROOM|CORRIDOR|SERVICE) \d+$/;

export function isUnlabeled(zone: Pick<ModelZone, 'name'>): boolean {
  return GENERATED_NAME.test(zone.name.trim());
}

export function unlabeledZones(proposal: ModelProposal): ModelZone[] {
  return proposal.zones.filter(isUnlabeled);
}

export interface ZoneCorrection { name?: string; category?: string }

export function correctZone(proposal: ModelProposal, zoneId: string, patch: ZoneCorrection): ModelProposal {
  const name = patch.name?.trim();
  return {
    ...proposal,
    zones: proposal.zones.map(zone => zone.id !== zoneId ? zone
      : { ...zone, name: name || zone.name, category: patch.category ?? zone.category }),
    nodes: proposal.nodes.map(node => node.id === zoneId && name ? { ...node, label: name } : node)
  };
}

/** A zone counts as reached when its own node is linked or a linked skeleton node lies inside it. */
export function isolatedZones(proposal: ModelProposal): ModelZone[] {
  const linked = new Set(proposal.connections.flatMap(link => [link.fromNodeId, link.toNodeId]));
  const points = proposal.nodes.filter(node => linked.has(node.id));
  return proposal.zones.filter(zone => !linked.has(zone.id) && !points.some(point => zoneContains(zone, point)));
}

function zoneContains(zone: ModelZone, point: { x: number; y: number }): boolean {
  if (!zone.polygon) {
    return point.x >= zone.x && point.x < zone.x + zone.width && point.y >= zone.y && point.y < zone.y + zone.height;
  }
  return ringContains(zone.polygon.outer, point) && !zone.polygon.holes.some(hole => ringContains(hole, point));
}

function ringContains(ring: { x: number; y: number }[], point: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

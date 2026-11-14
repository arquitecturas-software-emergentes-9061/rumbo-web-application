import { ModelProposal, ModelZone } from './plan-interpretation';

export type EnvironmentChange = 'MATCHED' | 'MOVED' | 'SPLIT' | 'MERGED' | 'AMBIGUOUS' | 'UNMATCHED';

export interface EnvironmentReconciliationItem {
  change: EnvironmentChange;
  previousZoneIds: string[];
  proposedZoneIds: string[];
  reason: string;
}

export interface EnvironmentReconciliation {
  proposal: ModelProposal;
  matches: ReadonlyMap<string, string>;
  review: EnvironmentReconciliationItem[];
}

interface Box { left: number; top: number; right: number; bottom: number }
interface Evidence {
  previous: ModelZone;
  proposed: ModelZone;
  intersection: number;
  iou: number;
  previousCoverage: number;
  proposedCoverage: number;
  position: number;
  shape: number;
  sameIdentity: boolean;
  sameLabel: boolean;
  reliable: boolean;
  moved: boolean;
}

const GENERATED_LABEL = /^(room|corridor|service|ambiente|sala|pasillo)\s*[-#]?\s*\d+$/i;

/**
 * Compares two interpretations without mutating either one. Identity is retained only for a unique,
 * geometrically supported one-to-one match; topology changes remain explicit review work.
 */
export function reconcileEnvironments(previous: ModelProposal, proposed: ModelProposal): EnvironmentReconciliation {
  const evidence = previous.zones.flatMap(oldZone => proposed.zones.map(newZone => compare(oldZone, newZone)));
  const review: EnvironmentReconciliationItem[] = [];
  const consumedPrevious = new Set<string>();
  const consumedProposed = new Set<string>();
  const matches = new Map<string, string>();

  for (const oldZone of previous.zones) {
    const related = evidence.filter(item => item.previous.id === oldZone.id && relatedGeometry(item));
    if (related.length < 2) continue;
    related.forEach(item => consumedProposed.add(item.proposed.id));
    consumedPrevious.add(oldZone.id);
    review.push({ change: 'SPLIT', previousZoneIds: [oldZone.id],
      proposedZoneIds: related.map(item => item.proposed.id),
      reason: 'Un ambiente anterior se superpone de forma significativa con varios ambientes nuevos.' });
  }

  for (const newZone of proposed.zones) {
    if (consumedProposed.has(newZone.id)) continue;
    const related = evidence.filter(item => item.proposed.id === newZone.id
      && !consumedPrevious.has(item.previous.id) && relatedGeometry(item));
    if (related.length < 2) continue;
    related.forEach(item => consumedPrevious.add(item.previous.id));
    consumedProposed.add(newZone.id);
    review.push({ change: 'MERGED', previousZoneIds: related.map(item => item.previous.id),
      proposedZoneIds: [newZone.id],
      reason: 'Varios ambientes anteriores se superponen de forma significativa con un ambiente nuevo.' });
  }

  const available = evidence.filter(item => !consumedPrevious.has(item.previous.id)
    && !consumedProposed.has(item.proposed.id));
  for (const oldZone of previous.zones) {
    if (consumedPrevious.has(oldZone.id)) continue;
    const candidates = available.filter(item => item.previous.id === oldZone.id && item.reliable);
    if (candidates.length !== 1) {
      if (candidates.length > 1) {
        consumedPrevious.add(oldZone.id);
        candidates.forEach(item => consumedProposed.add(item.proposed.id));
        review.push({ change: 'AMBIGUOUS', previousZoneIds: [oldZone.id],
          proposedZoneIds: candidates.map(item => item.proposed.id),
          reason: 'Más de un ambiente nuevo satisface los criterios de identidad y geometría.' });
      }
      continue;
    }
    const candidate = candidates[0];
    const reverse = available.filter(item => item.proposed.id === candidate.proposed.id && item.reliable);
    if (reverse.length !== 1 || consumedProposed.has(candidate.proposed.id)) {
      consumedPrevious.add(oldZone.id);
      consumedProposed.add(candidate.proposed.id);
      review.push({ change: 'AMBIGUOUS', previousZoneIds: reverse.map(item => item.previous.id),
        proposedZoneIds: [candidate.proposed.id],
        reason: 'El ambiente nuevo coincide de forma plausible con más de un ambiente anterior.' });
      continue;
    }
    consumedPrevious.add(oldZone.id);
    consumedProposed.add(candidate.proposed.id);
    matches.set(candidate.proposed.id, oldZone.id);
  }

  for (const oldZone of previous.zones) {
    if (consumedPrevious.has(oldZone.id)) continue;
    const moved = available.filter(item => item.previous.id === oldZone.id && item.moved
      && !consumedProposed.has(item.proposed.id));
    if (moved.length === 1 && available.filter(item => item.proposed.id === moved[0].proposed.id && item.moved).length === 1) {
      consumedPrevious.add(oldZone.id);
      consumedProposed.add(moved[0].proposed.id);
      review.push({ change: 'MOVED', previousZoneIds: [oldZone.id], proposedZoneIds: [moved[0].proposed.id],
        reason: 'La etiqueta o identidad coincide, pero la posición cambió sin solapamiento suficiente.' });
    }
  }

  previous.zones.filter(zone => !consumedPrevious.has(zone.id)).forEach(zone => review.push({
    change: 'UNMATCHED', previousZoneIds: [zone.id], proposedZoneIds: [],
    reason: 'No existe una correspondencia nueva fiable y única.'
  }));
  proposed.zones.filter(zone => !consumedProposed.has(zone.id)).forEach(zone => review.push({
    change: 'UNMATCHED', previousZoneIds: [], proposedZoneIds: [zone.id],
    reason: 'El ambiente nuevo no corresponde de forma fiable y única con uno anterior.'
  }));

  return { proposal: preserveMatchedIdentity(previous, proposed, matches), matches, review };
}

function preserveMatchedIdentity(previous: ModelProposal, proposed: ModelProposal,
                                 matches: ReadonlyMap<string, string>): ModelProposal {
  const oldById = new Map(previous.zones.map(zone => [zone.id, zone]));
  const rename = new Map(matches);
  return {
    ...proposed,
    zones: proposed.zones.map(zone => {
      const old = oldById.get(rename.get(zone.id) ?? '');
      return old ? { ...zone, id: old.id, name: old.name, category: old.category } : zone;
    }),
    nodes: proposed.nodes.map(node => {
      const oldId = rename.get(node.id);
      const old = oldById.get(oldId ?? '');
      return old ? { ...node, id: old.id, label: old.name } : node;
    }),
    connections: proposed.connections.map(link => ({ ...link,
      fromNodeId: rename.get(link.fromNodeId) ?? link.fromNodeId,
      toNodeId: rename.get(link.toNodeId) ?? link.toNodeId }))
  };
}

function compare(previous: ModelZone, proposed: ModelZone): Evidence {
  const oldBox = bounds(previous), newBox = bounds(proposed);
  const intersection = Math.max(0, Math.min(oldBox.right, newBox.right) - Math.max(oldBox.left, newBox.left))
    * Math.max(0, Math.min(oldBox.bottom, newBox.bottom) - Math.max(oldBox.top, newBox.top));
  const oldArea = area(oldBox), newArea = area(newBox);
  const iou = intersection / Math.max(1e-9, oldArea + newArea - intersection);
  const position = Math.hypot(centerX(oldBox) - centerX(newBox), centerY(oldBox) - centerY(newBox))
    / Math.max(1, Math.hypot(oldBox.right - oldBox.left, oldBox.bottom - oldBox.top),
      Math.hypot(newBox.right - newBox.left, newBox.bottom - newBox.top));
  const shape = Math.min(oldArea, newArea) / Math.max(oldArea, newArea, 1e-9);
  const sameIdentity = previous.id === proposed.id;
  const oldLabel = normalizedLabel(previous.name), newLabel = normalizedLabel(proposed.name);
  const sameLabel = oldLabel.length > 0 && oldLabel === newLabel && !GENERATED_LABEL.test(oldLabel);
  const reliable = (sameIdentity && iou >= .5 && position <= .35)
    || (sameLabel && iou >= .55 && position <= .35)
    || (iou >= .78 && position <= .2 && shape >= .65);
  const moved = !reliable && (sameIdentity || sameLabel) && shape >= .7 && iou < .3 && position > .35;
  return { previous, proposed, intersection, iou,
    previousCoverage: intersection / Math.max(oldArea, 1e-9),
    proposedCoverage: intersection / Math.max(newArea, 1e-9),
    position, shape, sameIdentity, sameLabel, reliable, moved };
}

function relatedGeometry(item: Evidence): boolean {
  return item.intersection > 0 && (item.previousCoverage >= .35 || item.proposedCoverage >= .35);
}

function bounds(zone: ModelZone): Box {
  const points = zone.polygon?.outer ?? [];
  if (points.length) return { left: Math.min(...points.map(point => point.x)), top: Math.min(...points.map(point => point.y)),
    right: Math.max(...points.map(point => point.x)), bottom: Math.max(...points.map(point => point.y)) };
  return { left: zone.x, top: zone.y, right: zone.x + zone.width, bottom: zone.y + zone.height };
}

function area(box: Box): number { return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top); }
function centerX(box: Box): number { return (box.left + box.right) / 2; }
function centerY(box: Box): number { return (box.top + box.bottom) / 2; }
function normalizedLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

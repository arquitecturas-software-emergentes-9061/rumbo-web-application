import { HttpErrorResponse } from '@angular/common/http';
import { ModelZone, PlanPolygon, ModelProposal } from '../../domain/model/plan-interpretation';

export type { ModelDoor, ModelProposal } from '../../domain/model/plan-interpretation';

export interface ViewBox { x: number; y: number; width: number; height: number }

/** Even-odd SVG paths retain courtyards and obstacles enclosed by a room boundary. */
export function polygonPath(polygon: PlanPolygon): string {
  return [polygon.outer, ...polygon.holes].filter(ring => ring.length >= 3)
    .map(ring => `M ${ring.map(point => `${point.x} ${point.y}`).join(' L ')} Z`).join(' ');
}

export function zonePath(zone: ModelZone): string {
  return polygonPath(zone.polygon ?? { outer: [
    { x: zone.x, y: zone.y }, { x: zone.x + zone.width, y: zone.y },
    { x: zone.x + zone.width, y: zone.y + zone.height }, { x: zone.x, y: zone.y + zone.height }
  ], holes: [] });
}

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

/** Fits every proposed element plus a margin so the preview never clips geometry. */
export function viewBoxFor(proposal: ModelProposal, marginRatio = 0.05): ViewBox {
  const xs: number[] = [];
  const ys: number[] = [];
  proposal.zones.forEach(zone => { xs.push(zone.x, zone.x + zone.width); ys.push(zone.y, zone.y + zone.height); });
  proposal.nodes.forEach(node => { xs.push(node.x); ys.push(node.y); });
  proposal.wallCandidates.forEach(wall => { xs.push(wall.x1, wall.x2); ys.push(wall.y1, wall.y2); });
  (proposal.doors ?? []).forEach(door => { xs.push(door.x1, door.x2); ys.push(door.y1, door.y2); });
  const polygons = [...proposal.zones.flatMap(zone => zone.polygon ? [zone.polygon] : []),
    ...(proposal.barriers ?? []).map(barrier => barrier.polygon), ...(proposal.walkable ?? [])];
  polygons.forEach(polygon => polygon.outer.forEach(point => { xs.push(point.x); ys.push(point.y); }));
  if (xs.length === 0) return { x: 0, y: 0, width: 100, height: 100 };
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1), height = Math.max(maxY - minY, 1);
  const marginX = width * marginRatio, marginY = height * marginRatio;
  return { x: minX - marginX, y: minY - marginY, width: width + 2 * marginX, height: height + 2 * marginY };
}

export function zoneFill(category: string): string {
  const key = category.toLowerCase();
  if (key.includes('corridor') || key.includes('pasillo')) return '#e8e8e8';
  if (key.includes('elevator') || key.includes('stair') || key.includes('ascensor') || key.includes('escalera')) return '#dfe7f3';
  if (key.includes('service') || key.includes('servicio')) return '#e6f1e8';
  return '#d9eaf3';
}

export function nodeLabel(proposal: ModelProposal, nodeId: string): string {
  return proposal.nodes.find(node => node.id === nodeId)?.label ?? nodeId;
}

export function describeGenerationError(error: HttpErrorResponse): string {
  if (error.error?.code === 'INVALID_SVG_PLAN') {
    return 'El SVG usa geometría o transformaciones que no se pueden interpretar de forma segura. Simplifica el plano y vuelve a cargarlo.';
  }
  if (error.status === 0) return 'No hay conexión con la API. Intenta de nuevo.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para generar el modelo.';
  if (error.status === 404) return 'El plano seleccionado ya no está disponible.';
  if (error.status === 413) return 'El plano es demasiado grande para interpretarlo.';
  return 'No se pudo generar el modelo. Intenta de nuevo o revisa el plano.';
}

/** The API names zones it could not label "ROOM 3", "CORRIDOR 2" or "SERVICE 1". */
const GENERATED_NAME = /^(ROOM|CORRIDOR|SERVICE) \d+$/;

export function isUnlabeled(zone: Pick<ModelProposal['zones'][number], 'name'>): boolean {
  return GENERATED_NAME.test(zone.name.trim());
}

export function unlabeledZones(proposal: ModelProposal) {
  return proposal.zones.filter(isUnlabeled);
}

export function describeDraftLoadError(error: HttpErrorResponse): string {
  if (error.status === 0) return 'No hay conexión con la API para cargar el borrador. Intenta de nuevo.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para ver el borrador de esta sede.';
  return 'No se pudo cargar el borrador de la sede. Recarga la página e inténtalo de nuevo.';
}

export function describeCreateDraftError(error: HttpErrorResponse): string {
  const code: string | undefined = error.error?.code;
  if (error.status === 0) return 'No hay conexión con la API para crear el borrador. Intenta de nuevo.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para editar el mapa de esta sede.';
  if (error.status === 404) return 'El plano seleccionado ya no existe para este piso. Recarga la página.';
  if (code === 'SITE_MAP_ALREADY_EXISTS') return 'Esta sede ya tiene un mapa publicado: crea una nueva versión del mapa para editarlo.';
  return 'No se pudo crear el borrador de la sede. Inténtalo de nuevo.';
}

export const ZONE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'ROOM', label: 'Consultorio o ambiente' }, { value: 'CORRIDOR', label: 'Pasillo' },
  { value: 'SERVICE', label: 'Servicio' }, { value: 'ELEVATOR', label: 'Ascensor' }, { value: 'STAIRS', label: 'Escalera' }
];

export function categoryLabel(category: string): string {
  return ZONE_CATEGORIES.find(item => item.value === category.toUpperCase())?.label ?? category;
}

export interface ZoneCorrection { name?: string; category?: string }

/** Applies a manual correction to one zone and to the node that shares its identifier. */
export function correctZone(proposal: ModelProposal, zoneId: string, patch: ZoneCorrection): ModelProposal {
  const name = patch.name?.trim();
  return {
    ...proposal,
    zones: proposal.zones.map(zone => zone.id !== zoneId ? zone
      : { ...zone, name: name || zone.name, category: patch.category ?? zone.category }),
    nodes: proposal.nodes.map(node => node.id === zoneId && name ? { ...node, label: name } : node)
  };
}

/** Zones whose node no recognized connection reaches, so travelers could never arrive at them. */
/**
 * Zones that no connection reaches. A zone counts as reached when its own node is linked (annotated SVG) or when a
 * linked node lies inside it: generated corridors are traversed by skeleton nodes that do not carry the zone id.
 */
export function isolatedZones(proposal: ModelProposal) {
  const linked = new Set(proposal.connections.flatMap(link => [link.fromNodeId, link.toNodeId]));
  const points = proposal.nodes.filter(node => linked.has(node.id));
  return proposal.zones.filter(zone => !linked.has(zone.id) && !points.some(point => zoneContains(zone, point)));
}

function zoneContains(zone: ModelZone, point: { x: number; y: number }): boolean {
  if (!zone.polygon) {
    // Half-open, like the polygon test, so a node on a shared wall belongs to one zone only.
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

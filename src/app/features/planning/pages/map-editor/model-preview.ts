import { HttpErrorResponse } from '@angular/common/http';
import { PlanInterpretation, PlanVersion } from '../floor-plan-calibration/floor-plans.service';

export type ModelProposal = NonNullable<PlanInterpretation['proposal']>;

export interface ViewBox { x: number; y: number; width: number; height: number }

export interface ProposalSummary { zones: number; nodes: number; connections: number; walls: number }

/** Only vector SVG can be interpreted; PDF and raster plans stay preview-only. */
export function isSvgVersion(version: Pick<PlanVersion, 'mediaType' | 'fileName'> | null): boolean {
  return !!version && (/svg/i.test(version.mediaType) || /\.svg$/i.test(version.fileName));
}

export function summarize(proposal: ModelProposal): ProposalSummary {
  return {
    zones: proposal.zones.length, nodes: proposal.nodes.length,
    connections: proposal.connections.length, walls: proposal.wallCandidates.length
  };
}

export function isEmptyProposal(proposal: ModelProposal): boolean {
  const { zones, nodes, walls } = summarize(proposal);
  return zones + nodes + walls === 0;
}

/** Fits every proposed element plus a margin so the preview never clips geometry. */
export function viewBoxFor(proposal: ModelProposal, marginRatio = 0.05): ViewBox {
  const xs: number[] = [];
  const ys: number[] = [];
  proposal.zones.forEach(zone => { xs.push(zone.x, zone.x + zone.width); ys.push(zone.y, zone.y + zone.height); });
  proposal.nodes.forEach(node => { xs.push(node.x); ys.push(node.y); });
  proposal.wallCandidates.forEach(wall => { xs.push(wall.x1, wall.x2); ys.push(wall.y1, wall.y2); });
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

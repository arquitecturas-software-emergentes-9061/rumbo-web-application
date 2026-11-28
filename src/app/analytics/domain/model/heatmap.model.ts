/** Deviations and recalculations recorded at one node of a floor, as absolute counts. */
export interface HeatmapCell {
  floorId: string;
  nodeReference: string;
  deviations: number;
  recalculations: number;
}

export interface NavigationHeatmap {
  cells: HeatmapCell[];
  /** Relevant events that arrived without a floor or node, so they cannot be placed on the map. */
  discardedEvents: number;
}

export interface PublishedSite { id: string; name: string }

export interface PlanBounds { floorId: string; widthUnits: number; heightUnits: number }
export interface FloorLabel { id: string; number: number; name: string }
export interface ModelNode { id: string; floorId: string; x: number; y: number; type: string }
export interface ModelDestination { id: string; nodeId: string; floorId: string; name: string }
export interface ModelWall { id: string; floorId: string; x1: number; y1: number; x2: number; y2: number }
export interface ModelDoor { id: string; wallId: string; from: number; to: number }

/** The official model of a site, read only to place heatmap cells on its floors. */
export interface SiteModel {
  siteId: string;
  plans: PlanBounds[];
  floors: FloorLabel[];
  nodes: ModelNode[];
  destinations: ModelDestination[];
  walls: ModelWall[];
  doors: ModelDoor[];
}

export type HeatLevel = 'none' | 'low' | 'medium' | 'high';

/** Legend of the disorientation heatmap: 1–5 low, 6–15 medium, 16 or more high deviations. */
export function heatLevel(deviations: number): HeatLevel {
  if (deviations >= 16) return 'high';
  if (deviations >= 6) return 'medium';
  if (deviations >= 1) return 'low';
  return 'none';
}

export interface PlacedCell extends HeatmapCell {
  x: number;
  y: number;
  label: string;
  level: HeatLevel;
}

export interface Hotspot {
  nodeReference: string;
  label: string;
  incidents: number;
  deviations: number;
  recalculations: number;
  /** Share of the floor's recalculations that happened at this node, in whole percent. */
  recalculationShare: number;
}

const NODE_KINDS: Record<string, string> = {
  INTERSECTION: 'Cruce', ACCESS: 'Acceso', DESTINATION: 'Destino', VERTICAL_LINK: 'Conexión vertical', REFERENCE: 'Referencia'
};

/** Destination name when the node has one; otherwise its kind plus a short id, as in the map editor. */
export function nodeLabel(model: SiteModel, nodeId: string): string {
  const destination = model.destinations.find(entry => entry.nodeId === nodeId);
  if (destination) return destination.name;
  const kind = NODE_KINDS[model.nodes.find(node => node.id === nodeId)?.type ?? ''] ?? 'Nodo';
  return `${kind} ${nodeId.slice(0, 4).toUpperCase()}`;
}

/** Cells of one floor whose node exists in the model; the rest cannot be drawn and are counted apart. */
export function placeCells(heatmap: NavigationHeatmap, model: SiteModel, floorId: string) {
  const nodes = new Map(model.nodes.filter(node => node.floorId === floorId).map(node => [node.id, node]));
  const placed: PlacedCell[] = [];
  let unplaced = 0;
  for (const cell of heatmap.cells.filter(item => item.floorId === floorId)) {
    const node = nodes.get(cell.nodeReference);
    if (!node) { unplaced++; continue; }
    placed.push({ ...cell, x: node.x, y: node.y, label: nodeLabel(model, node.id), level: heatLevel(cell.deviations) });
  }
  return { placed, unplaced };
}

/** Nodes of a floor ordered by incidents (deviations plus recalculations), the worst first. */
export function hotspots(cells: PlacedCell[], limit = 3): Hotspot[] {
  const totalRecalculations = cells.reduce((sum, cell) => sum + cell.recalculations, 0);
  return cells
    .map(cell => ({
      nodeReference: cell.nodeReference, label: cell.label, deviations: cell.deviations,
      recalculations: cell.recalculations, incidents: cell.deviations + cell.recalculations,
      recalculationShare: totalRecalculations === 0 ? 0 : Math.round((cell.recalculations / totalRecalculations) * 100)
    }))
    .filter(spot => spot.incidents > 0)
    .sort((a, b) => b.incidents - a.incidents || b.recalculations - a.recalculations || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Visible pieces of a wall once its door openings (fractions along the wall) are removed. */
export function wallSegments(wall: ModelWall, doors: ModelDoor[]) {
  const openings = doors.filter(door => door.wallId === wall.id)
    .map(door => [Math.max(0, door.from), Math.min(1, door.to)] as const)
    .sort((a, b) => a[0] - b[0]);
  const pieces: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const at = (t: number) => ({ x: wall.x1 + (wall.x2 - wall.x1) * t, y: wall.y1 + (wall.y2 - wall.y1) * t });
  let start = 0;
  for (const [from, to] of openings) {
    if (from > start) { const a = at(start), b = at(from); pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
    start = Math.max(start, to);
  }
  if (start < 1) { const a = at(start), b = at(1); pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  return pieces;
}

export const MAX_PERIOD_DAYS = 366;

export type PeriodResult = { from: string; to: string } | { error: string };

/** Turns calendar dates (YYYY-MM-DD, both included) into the half-open UTC interval the API expects. */
export function toPeriod(fromDate: string, toDate: string): PeriodResult {
  if (!fromDate || !toDate) return { error: 'Elige la fecha de inicio y la de fin.' };
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const lastDay = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(lastDay)) return { error: 'Las fechas no son válidas.' };
  if (from > lastDay) return { error: 'La fecha de inicio no puede ser posterior a la de fin.' };
  const to = lastDay + 24 * 60 * 60 * 1000;
  if ((to - from) / (24 * 60 * 60 * 1000) > MAX_PERIOD_DAYS) return { error: `El periodo no puede superar ${MAX_PERIOD_DAYS} días.` };
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** CSV with one row per cell, ready to open in a spreadsheet. */
export function toCsv(heatmap: NavigationHeatmap, model: SiteModel): string {
  const floorName = (id: string) => model.floors.find(floor => floor.id === id)?.name ?? id;
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = heatmap.cells.map(cell => [floorName(cell.floorId), nodeLabel(model, cell.nodeReference), cell.nodeReference,
    cell.deviations, cell.recalculations, heatLevel(cell.deviations)].map(quote).join(','));
  return ['piso,zona,nodo,desvios,recalculos,nivel', ...rows].join('\n') + '\n';
}

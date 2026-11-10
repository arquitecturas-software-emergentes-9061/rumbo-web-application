import { EditorGraph, MapDoor, MapWall, PlanBounds } from './map-graph.types';
import { ModelProposal } from './plan-interpretation';

export function validWall(wall: MapWall, plan: PlanBounds | null): boolean {
  return !!plan && wall.floorId === plan.floorId && wall.planVersionId === plan.planVersionId
    && [wall.x1, wall.y1, wall.x2, wall.y2].every(Number.isFinite)
    && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > 1e-6
    && [wall.x1, wall.x2].every(x => x >= 0 && x <= plan.widthUnits)
    && [wall.y1, wall.y2].every(y => y >= 0 && y <= plan.heightUnits);
}

export function validDoor(door: MapDoor, graph: EditorGraph): boolean {
  return !!graph.walls?.some(wall => wall.id === door.wallId)
    && Number.isFinite(door.from) && Number.isFinite(door.to)
    && door.from >= 0 && door.to <= 1 && door.to - door.from > 1e-6
    && !(graph.doors ?? []).some(other => other.id !== door.id && other.wallId === door.wallId
      && door.from < other.to && other.from < door.to);
}

export function doorSegment(door: MapDoor, wall: MapWall) {
  return { x1: wall.x1 + (wall.x2 - wall.x1) * door.from,
    y1: wall.y1 + (wall.y2 - wall.y1) * door.from,
    x2: wall.x1 + (wall.x2 - wall.x1) * door.to,
    y2: wall.y1 + (wall.y2 - wall.y1) * door.to };
}

export interface GeometryConflict { connectionId: string; message: string; point?: { x: number; y: number } }

export function crossingConflictDetails(graph: EditorGraph): GeometryConflict[] {
  const conflicts: GeometryConflict[] = [];
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  for (const [linkIndex, link] of graph.connections.entries()) {
    const a = nodes.get(link.sourceNodeId), b = nodes.get(link.targetNodeId);
    if (!a || !b || a.floorId !== b.floorId || a.planVersionId !== b.planVersionId) continue;
    let linkedDoor = false;
    let hasWall = false;
    let blockedCrossing = false;
    for (const [wallIndex, wall] of (graph.walls ?? []).entries()) {
      if (wall.planVersionId !== a.planVersionId) continue;
      hasWall = true;
      const dx = b.x - a.x, dy = b.y - a.y, wx = wall.x2 - wall.x1, wy = wall.y2 - wall.y1;
      const det = dx * wy - dy * wx;
      if (Math.abs(det) < 1e-8) continue;
      const rx = wall.x1 - a.x, ry = wall.y1 - a.y;
      const alongLink = (rx * wy - ry * wx) / det, alongWall = (rx * dy - ry * dx) / det;
      const opening = (graph.doors ?? []).some(door => door.wallId === wall.id
        && alongWall >= door.from - 1e-6 && alongWall <= door.to + 1e-6);
      if (opening && alongLink >= -1e-6 && alongLink <= 1 + 1e-6) linkedDoor = true;
      if (alongLink <= 1e-6 || alongLink >= 1 - 1e-6 || alongWall <= 1e-6 || alongWall >= 1 - 1e-6) continue;
      if (!opening || link.type !== 'DOORWAY') {
        conflicts.push({ connectionId: link.id, point: { x: a.x + alongLink * dx, y: a.y + alongLink * dy }, message: opening
          ? `La conexión ${linkIndex + 1} pasa por una puerta del muro ${wallIndex + 1}, pero tiene otro tipo. Selecciónala y cambia el tipo a «Puerta».`
          : `La conexión ${linkIndex + 1} cruza el muro ${wallIndex + 1} fuera de una puerta. Agrega una puerta en el cruce o modifica la conexión.` });
        blockedCrossing = true;
      }
    }
    if (link.type === 'DOORWAY' && hasWall && !linkedDoor && !blockedCrossing) {
      conflicts.push({ connectionId: link.id, message: `La conexión ${linkIndex + 1} está configurada como «Puerta», pero no pasa por una abertura de un muro. Revisa su recorrido, agrega una puerta o cambia su tipo.` });
    }
  }
  return conflicts;
}

export function crossingConflicts(graph: EditorGraph): string[] {
  return crossingConflictDetails(graph).map(conflict => conflict.message);
}

export function crossingError(graph: EditorGraph): string | null {
  return crossingConflicts(graph)[0] ?? null;
}

/** A recognized segment that needs correction or an opening that needs association. */
export interface GeometryReviewIssue {
  code: 'INVALID_WALL' | 'UNMATCHED_DOOR' | 'AMBIGUOUS_DOOR' | 'OVERLAPPING_DOOR';
  message: string;
  candidateKind: 'wall' | 'door';
  candidateIndex: number;
}

/** Keeps every valid candidate, including walls that expose routing conflicts. */
export function proposalGeometry(proposal: ModelProposal, plan: PlanBounds, graph: EditorGraph,
    newId: () => string): { walls: MapWall[]; doors: MapDoor[]; issues: GeometryReviewIssue[] } {
  const walls = [...(graph.walls ?? [])], doors = [...(graph.doors ?? [])];
  const issues: GeometryReviewIssue[] = [];
  const alignmentTolerance = Math.max(.25, Math.min(plan.widthUnits, plan.heightUnits) * .005);
  proposal.wallCandidates.forEach((line, index) => {
    const same = (wall: MapWall) => wall.planVersionId === plan.planVersionId
      && ((Math.hypot(wall.x1 - line.x1, wall.y1 - line.y1) < 1e-3
          && Math.hypot(wall.x2 - line.x2, wall.y2 - line.y2) < 1e-3)
        || (Math.hypot(wall.x1 - line.x2, wall.y1 - line.y2) < 1e-3
          && Math.hypot(wall.x2 - line.x1, wall.y2 - line.y1) < 1e-3));
    if (walls.some(same)) return;
    const wall: MapWall = { ...line, id: newId(), floorId: plan.floorId, planVersionId: plan.planVersionId };
    if (validWall(wall, plan)) walls.push(wall);
    else issues.push({ code: 'INVALID_WALL', candidateKind: 'wall', candidateIndex: index,
      message: `Muro candidato ${index + 1}: segmento fuera del plano o sin longitud; permanece visible para revisión.` });
  });

  for (const [doorIndex, candidate] of (proposal.doors ?? []).entries()) {
    const matches = walls.filter(wall => wall.planVersionId === plan.planVersionId).flatMap(wall => {
      const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, lengthSquared = dx * dx + dy * dy;
      const project = (x: number, y: number) => ((x - wall.x1) * dx + (y - wall.y1) * dy) / lengthSquared;
      const first = project(candidate.x1, candidate.y1), second = project(candidate.x2, candidate.y2);
      const from = Math.min(first, second), to = Math.max(first, second);
      const error = Math.max(
        Math.hypot(candidate.x1 - wall.x1 - first * dx, candidate.y1 - wall.y1 - first * dy),
        Math.hypot(candidate.x2 - wall.x1 - second * dx, candidate.y2 - wall.y1 - second * dy));
      return from >= -1e-6 && to <= 1 + 1e-6 && to - from > 1e-6 && error <= alignmentTolerance
        ? [{ wall, from: Math.max(0, from), to: Math.min(1, to), error }] : [];
    }).sort((a, b) => a.error - b.error);
    if (!matches.length) {
      issues.push({ code: 'UNMATCHED_DOOR', candidateKind: 'door', candidateIndex: doorIndex,
        message: `Puerta candidata ${doorIndex + 1}: no se encontró un muro compatible; conserva su trazo para asociarla manualmente.` });
      continue;
    }
    if (matches.length > 1 && Math.abs(matches[0].error - matches[1].error) < 1e-3) {
      issues.push({ code: 'AMBIGUOUS_DOOR', candidateKind: 'door', candidateIndex: doorIndex,
        message: `Puerta candidata ${doorIndex + 1}: coincide con varios muros; selecciona el muro correcto manualmente.` });
      continue;
    }
    const match = matches[0];
    const door: MapDoor = { id: newId(), wallId: match.wall.id, from: match.from, to: match.to };
    if (doors.some(existing => existing.wallId === door.wallId
      && Math.abs(existing.from - door.from) < 1e-3 && Math.abs(existing.to - door.to) < 1e-3)) continue;
    if (!validDoor(door, { ...graph, walls, doors })) {
      issues.push({ code: 'OVERLAPPING_DOOR', candidateKind: 'door', candidateIndex: doorIndex,
        message: `Puerta candidata ${doorIndex + 1}: abertura superpuesta; revisa su posición sobre el muro.` });
      continue;
    }
    doors.push(door);
  }
  return { walls, doors, issues };
}

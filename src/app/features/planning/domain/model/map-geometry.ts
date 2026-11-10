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

export function crossingError(graph: EditorGraph): string | null {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  for (const link of graph.connections) {
    const a = nodes.get(link.sourceNodeId), b = nodes.get(link.targetNodeId);
    if (!a || !b || a.floorId !== b.floorId || a.planVersionId !== b.planVersionId) continue;
    for (const wall of graph.walls ?? []) {
      if (wall.planVersionId !== a.planVersionId) continue;
      const dx = b.x - a.x, dy = b.y - a.y, wx = wall.x2 - wall.x1, wy = wall.y2 - wall.y1;
      const det = dx * wy - dy * wx;
      if (Math.abs(det) < 1e-8) continue;
      const rx = wall.x1 - a.x, ry = wall.y1 - a.y;
      const alongLink = (rx * wy - ry * wx) / det, alongWall = (rx * dy - ry * dx) / det;
      if (alongLink <= 1e-6 || alongLink >= 1 - 1e-6 || alongWall <= 1e-6 || alongWall >= 1 - 1e-6) continue;
      const opening = (graph.doors ?? []).some(door => door.wallId === wall.id
        && alongWall >= door.from - 1e-6 && alongWall <= door.to + 1e-6);
      if (!opening || link.type !== 'DOORWAY') return 'Una arista atraviesa un muro sin una abertura DOORWAY.';
    }
  }
  return null;
}

/** Adopts recognized linework only when it is compatible with the generated routing graph. */
export function proposalGeometry(proposal: ModelProposal, plan: PlanBounds, graph: EditorGraph,
    newId: () => string): Pick<EditorGraph, 'walls' | 'doors'> {
  const walls = [...(graph.walls ?? [])], doors = [...(graph.doors ?? [])];
  for (const line of proposal.wallCandidates) {
    const wall: MapWall = { ...line, id: newId(), floorId: plan.floorId, planVersionId: plan.planVersionId };
    if (!validWall(wall, plan)) continue;
    const lengthSquared = (wall.x2 - wall.x1) ** 2 + (wall.y2 - wall.y1) ** 2;
    const candidates = (proposal.doors ?? []).flatMap(candidate => {
      const project = (x: number, y: number) => ((x - wall.x1) * (wall.x2 - wall.x1)
        + (y - wall.y1) * (wall.y2 - wall.y1)) / lengthSquared;
      const first = project(candidate.x1, candidate.y1), second = project(candidate.x2, candidate.y2);
      const from = Math.min(first, second), to = Math.max(first, second);
      const distance = (x: number, y: number, t: number) => Math.hypot(
        x - wall.x1 - t * (wall.x2 - wall.x1), y - wall.y1 - t * (wall.y2 - wall.y1));
      if (from < 0 || to > 1 || from >= to
        || distance(candidate.x1, candidate.y1, first) > 2
        || distance(candidate.x2, candidate.y2, second) > 2) return [];
      return [{ id: newId(), wallId: wall.id, from, to }];
    });
    const next = { ...graph, walls: [...walls, wall], doors: [...doors, ...candidates] };
    if (!crossingError(next)) { walls.push(wall); doors.push(...candidates); }
  }
  return { walls, doors };
}

import { EditorGraph, GraphConnection, GraphNode } from './map-graph.types';

/** Mirrors Planning's persisted-wall rules, including collinear overlap. */
export function wallTraversalIssue(graph: EditorGraph, link: GraphConnection,
  source: GraphNode, target: GraphNode): string | null {
  if (source.floorId !== target.floorId || source.planVersionId !== target.planVersionId) return null;
  const walls = (graph.walls ?? []).filter(wall => wall.planVersionId === source.planVersionId);
  let linkedDoor = false;
  for (const wall of walls) {
    const dx = target.x - source.x, dy = target.y - source.y;
    const wx = wall.x2 - wall.x1, wy = wall.y2 - wall.y1;
    const rx = wall.x1 - source.x, ry = wall.y1 - source.y;
    const determinant = dx * wy - dy * wx;
    if (Math.abs(determinant) < 1e-8) {
      const squared = dx * dx + dy * dy;
      if (squared > 1e-12 && Math.abs(rx * dy - ry * dx) < 1e-8) {
        const first = (rx * dx + ry * dy) / squared;
        const last = first + (wx * dx + wy * dy) / squared;
        if (Math.min(1, Math.max(first, last)) - Math.max(0, Math.min(first, last)) > 1e-6)
          return 'CONNECTION_CROSSES_WALL';
      }
      continue;
    }
    const alongConnection = (rx * wy - ry * wx) / determinant;
    const alongWall = (rx * dy - ry * dx) / determinant;
    const throughDoor = (graph.doors ?? []).some(door => door.wallId === wall.id
      && alongWall >= door.from - 1e-6 && alongWall <= door.to + 1e-6);
    if (throughDoor && alongConnection >= -1e-6 && alongConnection <= 1 + 1e-6) linkedDoor = true;
    if (alongConnection <= 1e-6 || alongConnection >= 1 - 1e-6 || alongWall <= 1e-6 || alongWall >= 1 - 1e-6) continue;
    if (!throughDoor || link.type !== 'DOORWAY') return 'CONNECTION_CROSSES_WALL';
  }
  return link.type === 'DOORWAY' && walls.length > 0 && !linkedDoor ? 'DOORWAY_WITHOUT_OPENING' : null;
}

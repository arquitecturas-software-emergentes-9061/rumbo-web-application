import { EditorGraph } from './map-graph.types';

export interface DestinationReachability {
  reachable: number;
  total: number;
  percent: number;
  unreachableNodeIds: string[];
}

/** Reachability follows one-way connections from every access node in the draft. */
export function destinationReachability(graph: EditorGraph): DestinationReachability {
  const access = graph.nodes.filter(node => node.type === 'ACCESS').map(node => node.id);
  const edges = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const connection of graph.connections) {
    edges.get(connection.sourceNodeId)?.push(connection.targetNodeId);
    if (connection.bidirectional) edges.get(connection.targetNodeId)?.push(connection.sourceNodeId);
  }
  const visited = new Set(access), queue = [...access];
  for (let index = 0; index < queue.length; index++) {
    for (const id of edges.get(queue[index]) ?? []) {
      if (!visited.has(id)) { visited.add(id); queue.push(id); }
    }
  }
  const destinations = graph.nodes.filter(node => node.type === 'DESTINATION');
  const reachable = destinations.filter(node => visited.has(node.id)).length;
  return { reachable, total: destinations.length,
    percent: destinations.length ? Math.round(reachable / destinations.length * 100) : 100,
    unreachableNodeIds: destinations.filter(node => !visited.has(node.id)).map(node => node.id) };
}

/** Finds a nearby, reachable node from which the author can extend a route to an isolated node. */
export function repairOrigin(graph: EditorGraph, targetId: string): string | null {
  const target = graph.nodes.find(node => node.id === targetId);
  if (!target) return null;
  const access = graph.nodes.filter(node => node.type === 'ACCESS').map(node => node.id);
  const edges = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const link of graph.connections) {
    edges.get(link.sourceNodeId)?.push(link.targetNodeId);
    if (link.bidirectional) edges.get(link.targetNodeId)?.push(link.sourceNodeId);
  }
  const visited = new Set(access), queue = [...access];
  for (let index = 0; index < queue.length; index++) {
    for (const id of edges.get(queue[index]) ?? []) if (!visited.has(id)) { visited.add(id); queue.push(id); }
  }
  const linked = new Set(graph.connections.filter(link => link.sourceNodeId === targetId || link.targetNodeId === targetId)
    .flatMap(link => [link.sourceNodeId, link.targetNodeId]));
  const candidates = graph.nodes.filter(node => node.floorId === target.floorId && node.id !== targetId &&
    visited.has(node.id) && !linked.has(node.id));
  candidates.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
  return candidates[0]?.id ?? null;
}

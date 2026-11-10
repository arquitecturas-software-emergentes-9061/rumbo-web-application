import { EditorGraph, PlanBounds } from './map-graph.types';

export type AlertSeverity = 'error' | 'warning';
export type AlertElement = 'GRAPH' | 'PLAN' | 'NODE' | 'CONNECTION' | 'DESTINATION';

export interface GraphAlert {
  code: string;
  severity: AlertSeverity;
  elementType: AlertElement;
  elementId: string | null;
  message: string;
}

export interface ServerIssue {
  code: string;
  elementType: AlertElement;
  elementId: string | null;
  message: string;
}

const MESSAGES: Record<string, string> = {
  EMPTY_GRAPH: 'El mapa aún no tiene nodos.',
  MISSING_ACCESS: 'Falta al menos un nodo de acceso.',
  MISSING_DESTINATION: 'Falta al menos un nodo de destino.',
  MISSING_SCALE: 'El plano no tiene una escala confirmada. Calíbralo antes de publicar.',
  DISCONNECTED_NODE: 'El nodo está fuera del grafo conectado a un acceso.',
  UNREACHABLE_DESTINATION: 'No se puede llegar a este destino desde ningún acceso.',
  DUPLICATE_CONNECTION: 'Ya existe una conexión entre estos nodos.',
  INVALID_VERTICAL_CONNECTION: 'Una conexión entre pisos debe ser escalera, rampa o ascensor.',
  INVALID_CONNECTION_DATA: 'La distancia y el peso de la conexión deben ser positivos.',
  MISSING_DESTINATION_ENTRY: 'El nodo de destino no tiene una entrada del directorio.',
  INVALID_DESTINATION_NODE_TYPE: 'La entrada del directorio debe apuntar a un nodo de tipo destino.',
  INVALID_DESTINATION_DATA: 'Revisa el nombre y la especialidad del destino.',
  INVALID_NODE_DATA: 'Revisa la posición y el tipo del nodo.',
  MISSING_SOURCE_NODE: 'La conexión apunta a un nodo de origen que no existe.',
  MISSING_TARGET_NODE: 'La conexión apunta a un nodo de destino que no existe.'
};

export function messageFor(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? 'El servidor rechazó este elemento del mapa.';
}

function adjacency(graph: EditorGraph, directed: boolean): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>(graph.nodes.map(node => [node.id, new Set<string>()]));
  for (const link of graph.connections) {
    map.get(link.sourceNodeId)?.add(link.targetNodeId);
    if (!directed || link.bidirectional) map.get(link.targetNodeId)?.add(link.sourceNodeId);
  }
  return map;
}

function reachable(starts: string[], edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>(starts);
  const queue = [...starts];
  while (queue.length > 0) {
    for (const next of edges.get(queue.shift() as string) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

/** Mirrors the server's publication rules so authors see problems before saving. */
export function validateGraph(graph: EditorGraph, plans: PlanBounds[]): GraphAlert[] {
  const alerts: GraphAlert[] = [];
  const add = (code: string, severity: AlertSeverity, elementType: AlertElement, elementId: string | null) =>
    alerts.push({ code, severity, elementType, elementId, message: messageFor(code) });
  if (graph.nodes.length === 0) { add('EMPTY_GRAPH', 'error', 'GRAPH', null); return alerts; }

  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const accesses = graph.nodes.filter(node => node.type === 'ACCESS').map(node => node.id);
  const destinations = graph.nodes.filter(node => node.type === 'DESTINATION').map(node => node.id);
  if (accesses.length === 0) add('MISSING_ACCESS', 'error', 'GRAPH', null);
  if (destinations.length === 0) add('MISSING_DESTINATION', 'error', 'GRAPH', null);
  plans.filter(plan => plan.metersPerUnit === null).forEach(plan => add('MISSING_SCALE', 'warning', 'PLAN', plan.planVersionId));

  const seenPairs = new Set<string>();
  for (const link of graph.connections) {
    const source = nodes.get(link.sourceNodeId), target = nodes.get(link.targetNodeId);
    if (!source) add('MISSING_SOURCE_NODE', 'error', 'CONNECTION', link.id);
    if (!target) add('MISSING_TARGET_NODE', 'error', 'CONNECTION', link.id);
    if (!source || !target) continue;
    const key = [link.sourceNodeId, link.targetNodeId].sort().join('|');
    if (seenPairs.has(key)) add('DUPLICATE_CONNECTION', 'error', 'CONNECTION', link.id);
    seenPairs.add(key);
    if (!(link.distanceMeters > 0) || !(link.weight > 0)) add('INVALID_CONNECTION_DATA', 'error', 'CONNECTION', link.id);
    const crosses = source.floorId !== target.floorId;
    if (crosses && !['STAIRS', 'RAMP', 'ELEVATOR'].includes(link.type)) add('INVALID_VERTICAL_CONNECTION', 'error', 'CONNECTION', link.id);
  }

  for (const entry of graph.destinations) {
    const node = nodes.get(entry.nodeId);
    if (!node || node.type !== 'DESTINATION') add('INVALID_DESTINATION_NODE_TYPE', 'error', 'DESTINATION', entry.id);
  }
  const withEntry = new Set(graph.destinations.map(entry => entry.nodeId));
  destinations.filter(id => !withEntry.has(id)).forEach(id => add('MISSING_DESTINATION_ENTRY', 'warning', 'NODE', id));

  if (accesses.length > 0) {
    const connected = reachable([accesses[0]], adjacency(graph, false));
    graph.nodes.filter(node => !connected.has(node.id)).forEach(node => add('DISCONNECTED_NODE', 'error', 'NODE', node.id));
    const flow = reachable(accesses, adjacency(graph, true));
    destinations.filter(id => connected.has(id) && !flow.has(id)).forEach(id => add('UNREACHABLE_DESTINATION', 'error', 'NODE', id));
  }
  return alerts;
}

export function fromServerIssues(issues: ServerIssue[] | undefined): GraphAlert[] {
  return (issues ?? []).map(issue => ({
    code: issue.code, severity: 'error' as const, elementType: issue.elementType,
    elementId: issue.elementId, message: messageFor(issue.code, issue.message)
  }));
}

export function countErrors(alerts: GraphAlert[]): number {
  return alerts.filter(alert => alert.severity === 'error').length;
}

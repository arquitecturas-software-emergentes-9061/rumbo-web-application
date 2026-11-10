import { GraphNode, GraphConnection } from '../domain/model/map-graph.types';

export type VerticalType = 'ELEVATOR' | 'STAIRS' | 'RAMP';
export type Accessibility = 'UNKNOWN' | 'ACCESSIBLE' | 'INACCESSIBLE';

export interface DraftGraph {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  status: 'DRAFT';
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: { id: string; nodeId: string; type: string; name: string; specialty: string | null }[];
}

export interface DraftSnapshot {
  graph: DraftGraph;
  etag: string;
}

import { EditorGraph, MapWall, MapDoor } from '../domain/model/map-graph.types';

export type VerticalType = 'ELEVATOR' | 'STAIRS' | 'RAMP';
export type Accessibility = 'UNKNOWN' | 'ACCESSIBLE' | 'INACCESSIBLE';

export interface DraftGraph extends EditorGraph {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  status: 'DRAFT';
  walls: MapWall[];
  doors: MapDoor[];
}

export interface DraftSnapshot {
  graph: DraftGraph;
  etag: string;
}

import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { GraphAlert } from '../domain/model/graph-validation';

export interface DraftSnapshot {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  etag: string;
  plans: PlanBounds[];
  graph: EditorGraph;
}

export type SaveFailureKind = 'stale' | 'not-draft' | 'invalid' | 'offline' | 'forbidden' | 'missing' | 'other';

export interface SaveFailure {
  kind: SaveFailureKind;
  message: string;
  issues: GraphAlert[];
}

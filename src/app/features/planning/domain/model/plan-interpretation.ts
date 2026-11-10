import { ConnectionAccessibility, ConnectionType } from './map-graph.types';

export interface Point { x: number; y: number }
export interface PlanPolygon { outer: Point[]; holes: Point[][] }
export interface ModelZone {
  id: string; name: string; category: string; x: number; y: number; width: number; height: number;
  polygon?: PlanPolygon | null;
  labelPosition?: Point | null;
}
export interface ModelBarrier { kind: 'WALL' | 'WINDOW' | 'OBSTACLE'; polygon: PlanPolygon }
export interface ModelDoor { id: string; x1: number; y1: number; x2: number; y2: number }
export interface ModelProposal {
  zones: ModelZone[];
  nodes: (Point & { id: string; label: string; role?: string })[];
  connections: { id: string; fromNodeId: string; toNodeId: string; distanceUnits: number; kind?: string;
    bidirectional?: boolean; graphType?: ConnectionType; weight?: number; distanceMeters?: number;
    accessibility?: ConnectionAccessibility; verticalPenalty?: number }[];
  wallCandidates: { x1: number; y1: number; x2: number; y2: number }[];
  barriers?: ModelBarrier[];
  walkable?: PlanPolygon[];
  doors?: ModelDoor[];
  warnings: string[];
}


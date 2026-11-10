/** Planning's editable map graph. IDs remain stable while an element is edited. */
export type NodeType = 'INTERSECTION' | 'ACCESS' | 'DESTINATION' | 'VERTICAL_LINK' | 'REFERENCE';
export type ConnectionType = 'CORRIDOR' | 'DOORWAY' | 'STAIRS' | 'RAMP' | 'ELEVATOR';
export type DestinationType = 'DOCTOR' | 'SPECIALTY' | 'SERVICE';
export type ConnectionAccessibility = 'UNKNOWN' | 'ACCESSIBLE' | 'INACCESSIBLE';

export interface GraphNode {
  id: string;
  floorId: string;
  planVersionId: string;
  x: number;
  y: number;
  type: string;
}

export interface GraphConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  distanceMeters: number;
  weight: number;
  verticalPenalty: number;
  accessibility: ConnectionAccessibility;
  bidirectional: boolean;
}

export interface Destination {
  id: string;
  nodeId: string;
  type: string;
  name: string;
  specialty: string | null;
}

export interface PlanBounds {
  floorId: string;
  planVersionId: string;
  widthUnits: number;
  heightUnits: number;
  metersPerUnit: number | null;
}

export interface MapWall {
  id: string; floorId: string; planVersionId: string;
  x1: number; y1: number; x2: number; y2: number;
}

export interface MapDoor {
  id: string; wallId: string; from: number; to: number;
}

export interface EditorGraph {
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: Destination[];
  walls?: MapWall[];
  doors?: MapDoor[];
}

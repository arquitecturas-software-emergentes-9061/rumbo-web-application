export interface Beacon {
  id: string;
  siteId: string;
  floorId: string;
  identifier: string;
  name: string | null;
  proximityUuid: string | null;
  major: number | null;
  minor: number | null;
  txPowerDbm: number | null;
  x: number | null;
  y: number | null;
  active: boolean;
}

export interface SaveBeaconRequest {
  floorId: string;
  identifier: string;
  name: string;
  proximityUuid: string;
  major: number;
  minor: number;
  txPowerDbm: number;
  x: number | null;
  y: number | null;
}

export interface FloorPlanBounds {
  floorId: string;
  widthUnits: number;
  heightUnits: number;
}

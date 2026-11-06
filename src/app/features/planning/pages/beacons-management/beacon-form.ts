import { Beacon, SaveBeaconRequest } from '../../../../core/models/beacon.model';

export const MAC_PATTERN = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BeaconFormValue {
  name: string;
  identifier: string;
  proximityUuid: string;
  major: number | null;
  minor: number | null;
  txPowerDbm: number | null;
  floorId: string;
  active: boolean;
}

export interface BeaconPosition { x: number; y: number }

/** Builds the API body; the server normalizes identifiers to lowercase. */
export function toSaveRequest(value: BeaconFormValue, position: BeaconPosition | null): SaveBeaconRequest {
  return {
    floorId: value.floorId,
    identifier: value.identifier.trim().toLowerCase(),
    name: value.name.trim(),
    proximityUuid: value.proximityUuid.trim().toLowerCase(),
    major: value.major as number,
    minor: value.minor as number,
    txPowerDbm: value.txPowerDbm as number,
    x: position?.x ?? null,
    y: position?.y ?? null
  };
}

export function isPlaced(beacon: Pick<Beacon, 'x' | 'y'>): boolean {
  return beacon.x !== null && beacon.y !== null;
}

/** Approximate range label shown next to the calibrated power, as in the mockup. */
export function approximateRangeMeters(txPowerDbm: number | null): number | null {
  if (txPowerDbm === null || !Number.isFinite(txPowerDbm)) return null;
  return Math.max(1, Math.round(Math.pow(10, (txPowerDbm + 59) / 20) * 4));
}

export function clampToPlan(x: number, y: number, width: number, height: number): BeaconPosition {
  const round = (value: number) => Math.round(value * 10) / 10;
  return { x: round(Math.min(Math.max(x, 0), width)), y: round(Math.min(Math.max(y, 0), height)) };
}

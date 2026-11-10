import { Beacon } from './beacon.model';

export const MAC_PATTERN = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BeaconPosition { x: number; y: number }

export function isPlaced(beacon: Pick<Beacon, 'x' | 'y'>): boolean {
  return beacon.x !== null && beacon.y !== null;
}

export function clampToPlan(x: number, y: number, width: number, height: number): BeaconPosition {
  const round = (value: number) => Math.round(value * 10) / 10;
  return { x: round(Math.min(Math.max(x, 0), width)), y: round(Math.min(Math.max(y, 0), height)) };
}

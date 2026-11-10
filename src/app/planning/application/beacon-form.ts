import { SaveBeaconRequest } from '../domain/model/beacon.model';
import { BeaconPosition } from '../domain/model/beacon-rules';

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

/** Approximate range label shown next to the calibrated power, as in the mockup. */
export function approximateRangeMeters(txPowerDbm: number | null): number | null {
  if (txPowerDbm === null || !Number.isFinite(txPowerDbm)) return null;
  return Math.max(1, Math.round(Math.pow(10, (txPowerDbm + 59) / 20) * 4));
}

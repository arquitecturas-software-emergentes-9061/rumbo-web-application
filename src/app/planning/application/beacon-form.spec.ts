import { MAC_PATTERN, UUID_PATTERN, clampToPlan, hasValidPlacement, isInsidePlan, isPlaced } from '../domain/model/beacon-rules';
import { approximateRangeMeters, toSaveRequest } from './beacon-form';

describe('beacon form helpers', () => {
  const value = {
    name: ' B-05 ', identifier: ' AC:23:3F:8A:11:C4 ', proximityUuid: 'F7826DA6-4FA2-4E98-8024-BC5B71E0893E',
    major: 100, minor: 5, txPowerDbm: -59, floorId: 'floor-2', active: true
  };

  it('normalizes text fields and keeps an unplaced beacon without coordinates', () => {
    expect(toSaveRequest(value, null)).toEqual({
      floorId: 'floor-2', identifier: 'ac:23:3f:8a:11:c4', name: 'B-05',
      proximityUuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', major: 100, minor: 5, txPowerDbm: -59, x: null, y: null
    });
  });

  it('sends the chosen plan position', () => {
    expect(toSaveRequest(value, { x: 42.8, y: 18.2 })).toMatchObject({ x: 42.8, y: 18.2 });
  });

  it('validates MAC addresses and UUIDs', () => {
    expect(MAC_PATTERN.test('AC:23:3F:8A:11:C4')).toBe(true);
    expect(MAC_PATTERN.test('AC-23-3F-8A-11-C4')).toBe(false);
    expect(UUID_PATTERN.test('E2C56DB5-DFFB-48D2-B060-D0F5A71096E0')).toBe(true);
    expect(UUID_PATTERN.test('not-a-uuid')).toBe(false);
  });

  it('detects placement and clamps positions to the plan', () => {
    expect(isPlaced({ x: 1, y: 2 })).toBe(true);
    expect(isPlaced({ x: null, y: null })).toBe(false);
    expect(clampToPlan(120.26, -3, 100, 60)).toEqual({ x: 100, y: 0 });
    expect(clampToPlan(10.04, 5.06, 100, 60)).toEqual({ x: 10, y: 5.1 });
    const bounds = { floorId: 'floor-2', widthUnits: 100, heightUnits: 60 };
    expect(isInsidePlan({ x: 0, y: 60 }, bounds)).toBe(true);
    expect(isInsidePlan({ x: 100.1, y: 60 }, bounds)).toBe(false);
    expect(hasValidPlacement({ floorId: 'floor-2', x: 100, y: 60 }, bounds)).toBe(true);
    expect(hasValidPlacement({ floorId: 'floor-1', x: 10, y: 5 }, bounds)).toBe(false);
  });

  it('estimates a range only for a calibrated power', () => {
    expect(approximateRangeMeters(null)).toBeNull();
    expect(approximateRangeMeters(-59)).toBe(4);
  });
});

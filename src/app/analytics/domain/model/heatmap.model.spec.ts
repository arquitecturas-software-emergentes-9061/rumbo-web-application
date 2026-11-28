import { HeatmapCell, SiteModel, heatLevel, hotspots, placeCells, toCsv, toPeriod, wallSegments } from './heatmap.model';

const model: SiteModel = {
  siteId: 's1',
  plans: [{ floorId: 'f1', widthUnits: 100, heightUnits: 60 }],
  floors: [{ id: 'f1', number: 1, name: 'Piso 1' }],
  nodes: [
    { id: 'n1', floorId: 'f1', x: 10, y: 10, type: 'ACCESS' },
    { id: 'n2', floorId: 'f1', x: 50, y: 30, type: 'DESTINATION' },
    { id: 'n3', floorId: 'f1', x: 90, y: 50, type: 'INTERSECTION' }
  ],
  destinations: [{ id: 'd1', nodeId: 'n2', floorId: 'f1', name: 'Radiología' }],
  walls: [{ id: 'w1', floorId: 'f1', x1: 0, y1: 0, x2: 100, y2: 0 }],
  doors: [{ id: 'o1', wallId: 'w1', from: 0.4, to: 0.6 }]
};
const cell = (nodeReference: string, deviations: number, recalculations: number, floorId = 'f1'): HeatmapCell =>
  ({ floorId, nodeReference, deviations, recalculations });

describe('disorientation heatmap', () => {
  it('classifies deviations with the legend thresholds', () => {
    expect([0, 1, 5, 6, 15, 16, 40].map(heatLevel)).toEqual(['none', 'low', 'low', 'medium', 'medium', 'high', 'high']);
  });

  it('places the cells of a floor on their nodes and counts the ones it cannot place', () => {
    const result = placeCells({ cells: [cell('n2', 18, 5), cell('gone', 3, 1), cell('n1', 2, 0, 'f2')], discardedEvents: 0 }, model, 'f1');
    expect(result.placed).toEqual([expect.objectContaining({ nodeReference: 'n2', x: 50, y: 30, label: 'Radiología', level: 'high' })]);
    expect(result.unplaced).toBe(1);
  });

  it('labels nodes without a destination by their kind and short id', () => {
    const { placed } = placeCells({ cells: [cell('n3', 1, 0)], discardedEvents: 0 }, model, 'f1');
    expect(placed[0].label).toBe('Cruce N3');
  });

  it('ranks the worst nodes by incidents and computes their share of recalculations', () => {
    const { placed } = placeCells({ cells: [cell('n1', 2, 1), cell('n2', 18, 3), cell('n3', 0, 0)], discardedEvents: 0 }, model, 'f1');
    const spots = hotspots(placed);
    expect(spots.map(spot => spot.nodeReference)).toEqual(['n2', 'n1']);
    expect(spots[0]).toMatchObject({ incidents: 21, recalculationShare: 75 });
    expect(spots[1]).toMatchObject({ incidents: 3, recalculationShare: 25 });
  });

  it('leaves a gap in the wall where a door opens', () => {
    expect(wallSegments(model.walls[0], model.doors)).toEqual([
      { x1: 0, y1: 0, x2: 40, y2: 0 }, { x1: 60, y1: 0, x2: 100, y2: 0 }
    ]);
    expect(wallSegments(model.walls[0], [])).toEqual([{ x1: 0, y1: 0, x2: 100, y2: 0 }]);
  });

  it('turns calendar dates into the half-open UTC period and rejects invalid ranges', () => {
    expect(toPeriod('2026-09-01', '2026-09-30')).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' });
    expect(toPeriod('2026-09-30', '2026-09-01')).toEqual({ error: expect.stringContaining('posterior') });
    expect(toPeriod('', '2026-09-01')).toEqual({ error: expect.stringContaining('Elige') });
    expect(toPeriod('2025-01-01', '2026-09-01')).toEqual({ error: expect.stringContaining('366') });
  });

  it('exports one quoted row per cell with its floor, zone and level', () => {
    const csv = toCsv({ cells: [cell('n2', 18, 3)], discardedEvents: 0 }, model);
    expect(csv.trim().split('\n')).toEqual(['piso,zona,nodo,desvios,recalculos,nivel', '"Piso 1","Radiología","n2","18","3","high"']);
  });
});

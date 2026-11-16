import { ModelProposal, ModelZone } from './plan-interpretation';
import { reconcileEnvironments } from './plan-reconciliation';

describe('plan environment reconciliation', () => {
  it('preserves identity, edited name and category only for a unique geometric match', () => {
    const previous = proposal([zone('old', 'Cardiología', 'SERVICE', 0, 0, 20, 20)]);
    const next = proposal([zone('detected-7', 'ROOM 7', 'ROOM', 1, 1, 20, 20)]);
    const result = reconcileEnvironments(previous, next);

    expect(result.review).toEqual([]);
    expect(result.proposal.zones[0]).toMatchObject({ id: 'old', name: 'Cardiología', category: 'SERVICE' });
    expect(result.proposal.nodes[0]).toMatchObject({ id: 'old', label: 'Cardiología' });
  });

  it('classifies a translated room as moved and does not invent a match', () => {
    const result = reconcileEnvironments(
      proposal([zone('old', 'Rayos X', 'SERVICE', 0, 0, 20, 20)]),
      proposal([zone('new', 'Rayos X', 'ROOM', 70, 70, 20, 20)]));

    expect(result.matches.size).toBe(0);
    expect(result.review).toEqual([expect.objectContaining({ change: 'MOVED',
      previousZoneIds: ['old'], proposedZoneIds: ['new'] })]);
    expect(result.proposal.zones[0].id).toBe('new');
  });

  it('classifies splits and merges for manual review', () => {
    const split = reconcileEnvironments(
      proposal([zone('old', 'Hospitalización', 'ROOM', 0, 0, 40, 20)]),
      proposal([zone('left', 'Sala A', 'ROOM', 0, 0, 20, 20), zone('right', 'Sala B', 'ROOM', 20, 0, 20, 20)]));
    expect(split.review).toContainEqual(expect.objectContaining({ change: 'SPLIT', previousZoneIds: ['old'] }));

    const merged = reconcileEnvironments(
      proposal([zone('left', 'Sala A', 'ROOM', 0, 0, 20, 20), zone('right', 'Sala B', 'ROOM', 20, 0, 20, 20)]),
      proposal([zone('new', 'Hospitalización', 'ROOM', 0, 0, 40, 20)]));
    expect(merged.review).toContainEqual(expect.objectContaining({ change: 'MERGED', proposedZoneIds: ['new'] }));
  });

  it('leaves unrelated and label-ambiguous rooms unmatched', () => {
    const result = reconcileEnvironments(
      proposal([zone('a', 'Consultorio', 'ROOM', 0, 0, 10, 10), zone('b', 'Consultorio', 'ROOM', 30, 0, 10, 10)]),
      proposal([zone('x', 'Consultorio', 'ROOM', 80, 80, 10, 10)]));

    expect(result.matches.size).toBe(0);
    expect(result.review.filter(item => item.change === 'UNMATCHED')).toHaveLength(3);
  });
});

function proposal(zones: ModelZone[]): ModelProposal {
  return { zones, nodes: zones.map(item => ({ id: item.id, label: item.name, role: 'DESTINATION',
    x: item.x + item.width / 2, y: item.y + item.height / 2 })),
    connections: [], wallCandidates: [], warnings: [] };
}

function zone(id: string, name: string, category: string, x: number, y: number,
              width: number, height: number): ModelZone {
  return { id, name, category, x, y, width, height,
    polygon: { outer: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], holes: [] } };
}

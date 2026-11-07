import { HttpErrorResponse } from '@angular/common/http';
import { categoryLabel, correctZone, isolatedZones, describeDraftLoadError, describeGenerationError, isEmptyProposal, isSvgVersion, isUnlabeled, summarize, viewBoxFor, zoneFill } from './model-preview';

const proposal = {
  zones: [{ id: 'z1', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 100, height: 60 }],
  nodes: [{ id: 'n1', label: 'N-01', x: 50, y: 60 }],
  connections: [{ id: 'c1', fromNodeId: 'n1', toNodeId: 'n1', distanceUnits: 1 }],
  wallCandidates: [{ x1: 0, y1: 0, x2: 100, y2: 0 }],
  warnings: []
};

describe('model preview helpers', () => {
  it('accepts only vector SVG plans for generation', () => {
    expect(isSvgVersion({ mediaType: 'image/svg+xml', fileName: 'p.svg' })).toBe(true);
    expect(isSvgVersion({ mediaType: 'application/octet-stream', fileName: 'P.SVG' })).toBe(true);
    expect(isSvgVersion({ mediaType: 'application/pdf', fileName: 'p.pdf' })).toBe(false);
    expect(isSvgVersion(null)).toBe(false);
  });

  it('summarizes and detects an empty proposal', () => {
    expect(summarize(proposal)).toEqual({ zones: 1, nodes: 1, connections: 1, walls: 1, doors: 0 });
    expect(isEmptyProposal(proposal)).toBe(false);
    expect(isEmptyProposal({ ...proposal, zones: [], nodes: [], wallCandidates: [] })).toBe(true);
  });

  it('fits all geometry with a margin', () => {
    const box = viewBoxFor(proposal, 0.1);
    expect(box).toEqual({ x: -10, y: -6, width: 120, height: 72 });
    expect(viewBoxFor({ ...proposal, zones: [], nodes: [], wallCandidates: [] })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('colors zones by category', () => {
    expect(zoneFill('CORRIDOR')).toBe('#e8e8e8');
    expect(zoneFill('ELEVATOR')).toBe('#dfe7f3');
    expect(zoneFill('ROOM')).toBe('#d9eaf3');
  });

  it('explains generation failures', () => {
    expect(describeGenerationError(new HttpErrorResponse({ status: 422, error: { code: 'INVALID_SVG_PLAN' } }))).toContain('geometría');
    expect(describeGenerationError(new HttpErrorResponse({ status: 0 }))).toContain('conexión');
    expect(describeGenerationError(new HttpErrorResponse({ status: 403 }))).toContain('permiso');
    expect(describeGenerationError(new HttpErrorResponse({ status: 500 }))).toContain('No se pudo generar');
  });

  it('explains draft loading failures without mentioning model generation', () => {
    expect(describeDraftLoadError(new HttpErrorResponse({ status: 0 }))).toContain('conexión');
    expect(describeDraftLoadError(new HttpErrorResponse({ status: 403 }))).toContain('permiso');
    expect(describeDraftLoadError(new HttpErrorResponse({ status: 500 }))).toContain('cargar el borrador');
  });

  it('detects names the API generated for unlabeled zones', () => {
    expect(isUnlabeled({ name: 'ROOM 3' })).toBe(true);
    expect(isUnlabeled({ name: 'CORRIDOR 12' })).toBe(true);
    expect(isUnlabeled({ name: 'Consultorio 101' })).toBe(false);
    expect(isUnlabeled({ name: 'Room 3' })).toBe(false);
  });

  it('counts doors and includes them when fitting the view', () => {
    const withDoors = { ...proposal, doors: [{ id: 'door-0', x1: 200, y1: 5, x2: 200, y2: 15 }] };
    expect(summarize(withDoors).doors).toBe(1);
    const box = viewBoxFor(withDoors, 0);
    expect(box.x + box.width).toBe(200);
  });

  it('corrects the name and category of one zone and of the node that shares its id', () => {
    const base = {
      ...proposal,
      zones: [{ id: 'zone-1', name: 'ROOM 2', category: 'ROOM', x: 0, y: 0, width: 10, height: 10 }, proposal.zones[0]],
      nodes: [{ id: 'zone-1', label: 'ROOM 2', x: 1, y: 1 }]
    };
    const next = correctZone(base, 'zone-1', { name: '  Triaje ', category: 'SERVICE' });
    expect(next.zones[0]).toMatchObject({ name: 'Triaje', category: 'SERVICE' });
    expect(next.nodes[0].label).toBe('Triaje');
    expect(next.zones[1]).toEqual(base.zones[1]);
    expect(isUnlabeled(next.zones[0])).toBe(false);
    expect(correctZone(base, 'zone-1', { name: '   ' }).zones[0].name).toBe('ROOM 2');
  });

  it('finds zones that no connection reaches', () => {
    const zones = [{ id: 'a', name: 'A', category: 'ROOM', x: 0, y: 0, width: 1, height: 1 }, { id: 'b', name: 'B', category: 'ROOM', x: 5, y: 0, width: 1, height: 1 }, { id: 'c', name: 'C', category: 'ROOM', x: 9, y: 0, width: 1, height: 1 }];
    const linked = { ...proposal, zones, connections: [{ id: 'k', fromNodeId: 'a', toNodeId: 'b', distanceUnits: 5 }] };
    expect(isolatedZones(linked).map(zone => zone.id)).toEqual(['c']);
    expect(isolatedZones({ ...linked, connections: [] })).toHaveLength(3);
  });

  it('names categories in Spanish and keeps unknown ones as they are', () => {
    expect(categoryLabel('corridor')).toBe('Pasillo');
    expect(categoryLabel('ELEVATOR')).toBe('Ascensor');
    expect(categoryLabel('OTHER')).toBe('OTHER');
  });
});

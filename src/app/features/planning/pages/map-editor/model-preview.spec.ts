import { HttpErrorResponse } from '@angular/common/http';
import { describeDraftLoadError, describeGenerationError, isEmptyProposal, isSvgVersion, isUnlabeled, summarize, viewBoxFor, zoneFill } from './model-preview';

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
    expect(summarize(proposal)).toEqual({ zones: 1, nodes: 1, connections: 1, walls: 1 });
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
});

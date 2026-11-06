import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { SitesService } from '../../../../core/services/sites.service';
import { FloorPlansService, PlanInterpretation, PlanVersion } from '../floor-plan-calibration/floor-plans.service';
import { MapEditorComponent } from './map-editor.component';

describe('MapEditorComponent', () => {
  const site = { id: 'site', name: 'Sede Central', address: null, clinicId: 'c' };
  const floor = { id: 'floor', siteId: 'site', number: 2, name: 'Piso 2', description: null };
  const svg: PlanVersion = { id: 'v2', version: 2, fileName: 'piso2.svg', mediaType: 'image/svg+xml', sizeBytes: 10, createdAt: '' };
  const pdf: PlanVersion = { ...svg, id: 'v1', version: 1, fileName: 'piso2.pdf', mediaType: 'application/pdf' };
  const proposal = {
    zones: [{ id: 'z1', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 100, height: 60 }],
    nodes: [{ id: 'n1', label: 'N-01', x: 50, y: 60 }, { id: 'n2', label: 'N-02', x: 50, y: 90 }],
    connections: [{ id: 'c1', fromNodeId: 'n1', toNodeId: 'n2', distanceUnits: 30 }],
    wallCandidates: [{ x1: 0, y1: 0, x2: 100, y2: 0 }],
    warnings: ['Etiqueta ambigua']
  };
  const result = (overrides: Partial<PlanInterpretation> = {}): PlanInterpretation => ({
    versionId: 'v2', floorId: 'floor', mediaType: 'image/svg+xml', processing: 'SVG_CANDIDATES',
    scaleStatus: 'PROVISIONAL', metersPerUnit: null, proposal, ...overrides
  });
  const sites = { loadSites: () => of([site]), loadFloors: vi.fn() };
  const plans = { list: vi.fn(), interpret: vi.fn() };
  let component: MapEditorComponent;

  const create = (versions: PlanVersion[]) => {
    plans.list.mockReturnValue(of(versions));
    const fixture = TestBed.createComponent(MapEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sites.loadFloors.mockReturnValue(of([floor]));
    TestBed.configureTestingModule({
      imports: [MapEditorComponent],
      providers: [provideRouter([]), { provide: SitesService, useValue: sites },
        { provide: FloorPlansService, useValue: plans }, { provide: AuthService, useValue: {} }]
    });
  });

  it('selects the current plan and enables generation only for SVG', () => {
    create([svg, pdf]);
    expect(component.versionId()).toBe('v2');
    expect(component.canGenerate()).toBe(true);
    component.selectVersion('v1');
    expect(component.canGenerate()).toBe(false);
    expect(component.blockedReason()).toContain('SVG');
  });

  it('explains when the floor has no plan', () => {
    create([]);
    expect(component.canGenerate()).toBe(false);
    expect(component.blockedReason()).toContain('aún no tiene un plano');
  });

  it('generates a preview without saving and surfaces warnings and provisional scale as alerts', () => {
    create([svg]);
    plans.interpret.mockReturnValue(of(result()));
    component.generate();
    expect(plans.interpret).toHaveBeenCalledWith('site', 'floor', 'v2');
    expect(component.summary()).toEqual({ zones: 1, nodes: 2, connections: 1, walls: 1 });
    expect(component.tab()).toBe('alerts');
    expect(component.alerts()).toContain('Etiqueta ambigua');
    expect(component.alerts().some(message => message.includes('provisional'))).toBe(true);
    expect(component.connectionLine(proposal.connections[0])).toEqual({ x1: 50, y1: 60, x2: 50, y2: 90 });
  });

  it('omits the provisional alert once the scale is confirmed', () => {
    create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', metersPerUnit: 0.1 })));
    component.generate();
    expect(component.alerts().some(message => message.includes('provisional'))).toBe(false);
  });

  it('reports preview-only responses and empty proposals instead of drawing nothing', () => {
    create([svg]);
    plans.interpret.mockReturnValueOnce(of(result({ processing: 'PREVIEW_ONLY', proposal: null })));
    component.generate();
    expect(component.proposal()).toBeNull();
    expect(component.notice()).toContain('solo permite vista previa');
    plans.interpret.mockReturnValueOnce(of(result({ proposal: { ...proposal, zones: [], nodes: [], wallCandidates: [], connections: [] } })));
    component.generate();
    expect(component.proposal()).toBeNull();
    expect(component.notice()).toContain('No se reconoció');
  });

  it('shows the server error and clears any previous preview on failure', () => {
    create([svg]);
    plans.interpret.mockReturnValueOnce(of(result()));
    component.generate();
    plans.interpret.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'INVALID_SVG_PLAN' } })));
    component.generate();
    expect(component.proposal()).toBeNull();
    expect(component.error()).toContain('geometría');
    expect(component.generating()).toBe(false);
  });

  it('shows properties of a selected zone and toggles the selection', () => {
    create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: [] } })));
    component.generate();
    expect(component.tab()).toBe('properties');
    component.selectZone('z1');
    expect(component.selectedZone()?.name).toBe('Consultorio 101');
    component.selectZone('z1');
    expect(component.selectedZone()).toBeNull();
  });
});

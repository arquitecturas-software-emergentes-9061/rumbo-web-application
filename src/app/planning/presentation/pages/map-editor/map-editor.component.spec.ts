import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { SITES_PORT } from '../../../application/planning.ports';
import { PlanInterpretation, PlanVersion } from '../../../application/floor-plan.contracts';
import { FLOOR_PLANS_PORT } from '../../../application/planning.ports';
import { MapEditorComponent } from './map-editor.component';
import { ModelProposal } from './model-preview';
import { DraftSnapshot } from '../../../application/map-editor.contracts';
import { MAP_EDITOR_PORT } from '../../../application/planning.ports';
import { HttpErrorResponse as HttpError } from '@angular/common/http';

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
  const drafts = { load: vi.fn(), save: vi.fn(), createFirstDraft: vi.fn() };
  const draft = (scale: number | null = 0.5, graph: DraftSnapshot['graph'] = { nodes: [], connections: [], destinations: [] }): DraftSnapshot => ({
    siteId: 'site', mapId: 'm', modelVersionId: 'v', etag: '"rev-1"', graph,
    plans: [{ floorId: 'floor', planVersionId: 'pv', widthUnits: 100, heightUnits: 60, metersPerUnit: scale }]
  });
  let component: MapEditorComponent;

  const create = (versions: PlanVersion[]) => {
    plans.list.mockReturnValue(of(versions));
    const fixture = TestBed.createComponent(MapEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sites.loadFloors.mockReturnValue(of([floor]));
    drafts.load.mockReturnValue(of(draft()));
    plans.interpret.mockReturnValue(of(result()));
    TestBed.configureTestingModule({
      imports: [MapEditorComponent],
      providers: [provideRouter([]), { provide: SITES_PORT, useValue: sites },
        { provide: FLOOR_PLANS_PORT, useValue: plans }, { provide: MAP_EDITOR_PORT, useValue: drafts }, { provide: AUTH_PORT, useValue: {} }]
    });
  });

  it('selects the current plan and enables generation for any stored format', () => {
    create([svg, pdf]);
    expect(component.tools.map(tool => tool.label)).not.toContain('Mover');
    expect(component.tools.find(tool => tool.id === 'select')?.hint).toContain('arrastra');
    expect(component.versionId()).toBe('v2');
    expect(component.canGenerate()).toBe(true);
    component.selectVersion('v1');
    expect(component.canGenerate()).toBe(true);
    expect(component.blockedReason()).toBeNull();
  });

  it('asks the API to interpret a PDF instead of refusing it in the browser', () => {
    create([pdf]);
    plans.interpret.mockReturnValue(of(result({ mediaType: 'application/pdf' })));
    component.generate();
    expect(plans.interpret).toHaveBeenCalledWith('site', 'floor', 'v1');
    expect(component.proposal()).not.toBeNull();
  });

  it('renders actual room boundaries and holes instead of their bounding rectangles', () => {
    const polygon = { outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 60 }, { x: 0, y: 60 }],
      holes: [[{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }]] };
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal,
      zones: [{ ...proposal.zones[0], polygon, labelPosition: { x: 10, y: 40 } }],
      barriers: [{ kind: 'WINDOW', polygon }]
    } })));
    const fixture = create([svg]);
    component.generate();
    fixture.detectChanges();
    const path = fixture.nativeElement.querySelector('svg.canvas .backdrop path.zone');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('d').match(/M /g)).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('svg.canvas .backdrop rect.zone')).toBeNull();
    expect(fixture.nativeElement.querySelector('svg.canvas .backdrop text').getAttribute('y')).toBe('40');
    expect(fixture.nativeElement.querySelector('path.barrier.window')).not.toBeNull();
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
    expect(component.summary()).toEqual({ zones: 1, nodes: 2, connections: 1, walls: 1, doors: 0 });
    expect(component.tab()).toBe('alerts');
    expect(component.alerts()).toContain('Etiqueta ambigua');
    expect(component.alerts()).toContain('No se reconocieron puertas en este plano. Revisa los muros y agrega las aberturas manualmente antes de crear rutas por ellas.');
    expect(component.alerts().some(message => message.includes('provisional'))).toBe(true);
    expect(component.connectionLine(proposal.connections[0])).toEqual({ x1: 50, y1: 60, x2: 50, y2: 90 });
  });

  it('explains a rejected route without raw IDs and locates its candidate midpoint', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, connections: [],
      warnings: ['Conexión candidata n1–n2: atraviesa un muro; revisa el plano'] } })));
    component.generate(); fixture.detectChanges();
    expect(component.alerts()[0]).toContain('entre nodo 1 y nodo 2');
    expect(component.alerts()[0]).not.toContain('n1–n2');
    const warning = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('entre nodo 1 y nodo 2')) as HTMLButtonElement;
    warning.click(); fixture.detectChanges();
    expect(component.highlightedPoint()).toEqual({ x: 50, y: 75 });
  });

  it('shows a detected door for review even when no room was recognized', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { zones: [], nodes: [], connections: [],
      wallCandidates: [], doors: [{ id: 'uncertain-door', x1: 30, y1: 20, x2: 45, y2: 20 }],
      warnings: ['Puerta uncertain-door: no se identificaron ambos lados de la abertura'] } })));
    component.generate(); fixture.detectChanges();
    expect(component.proposal()).not.toBeNull();
    expect(component.summary()?.doors).toBe(1);
    expect(fixture.nativeElement.querySelector('.backdrop line.door')).not.toBeNull();
    expect(component.alerts().some(message => message.includes('Puerta 1'))).toBe(true);
    const alert = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Puerta 1')) as HTMLButtonElement;
    alert.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.backdrop line.door.selected')).not.toBeNull();
  });

  it('shows every recognized layer and retains a conflicting wall for correction after applying', () => {
    const fixture = create([svg]);
    const detected = { zones: [{ id: 'room', name: 'Sala', category: 'ROOM', x: 0, y: 0, width: 20, height: 20 }],
      nodes: [{ id: 'a', label: 'A', x: 20, y: 30 }, { id: 'b', label: 'B', x: 80, y: 30 }],
      connections: [{ id: 'link', fromNodeId: 'a', toNodeId: 'b', distanceUnits: 60 }],
      wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }],
      doors: [{ id: 'unmatched', x1: 10, y1: 5, x2: 10, y2: 15 }], warnings: [] };
    plans.interpret.mockReturnValue(of(result({ proposal: detected, scaleStatus: 'CONFIRMED' })));
    component.generate(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.backdrop .zone')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.backdrop line')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.editable-wall')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('g.node')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('line.edge')).toHaveLength(1);
    expect(component.alerts().some(message => message.includes('Puerta candidata 1'))).toBe(true);
    const candidateWarning = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Puerta candidata 1')) as HTMLButtonElement;
    candidateWarning.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.backdrop .door.selected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('circle.alert-target')).not.toBeNull();
    component.applyProposal();
    expect(component.editor.floorWalls()).toHaveLength(1);
    expect(component.editor.geometryError()).toContain('cruza el muro');
    expect(component.editor.geometryError()).toContain('La conexión 1');
    expect(component.editor.geometryError()).not.toContain(component.editor.graph().connections[0].id);
    expect(component.canSave()).toBe(false);
    const conflict = component.graphAlerts().find(alert => alert.message.includes('La conexión 1 cruza'));
    expect(conflict?.elementId).toBe(component.editor.graph().connections[0].id);
    component.tab.set('alerts'); fixture.detectChanges();
    const conflictButton = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('La conexión 1 cruza')) as HTMLButtonElement;
    conflictButton.click(); fixture.detectChanges();
    expect(component.tab()).toBe('alerts');
    expect(fixture.nativeElement.querySelector('line.edge.selected')).not.toBeNull();
    component.focusAlert(conflict!);
    fixture.detectChanges();
    expect(component.editor.selectedConnection()?.id).toBe(component.editor.graph().connections[0].id);
    expect(fixture.nativeElement.querySelector('.id')?.textContent).toContain('Conexión 1');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).not.toContain(component.editor.graph().connections[0].id);
    component.chooseTool('door');
    component.wallPicked({ id: component.editor.floorWalls()[0].id, fraction: .5 });
    expect(component.editor.geometryError()).toBeNull();
    expect(component.canSave()).toBe(true);
  });

  it('edits recognized walls and doors in the proposal and applies the corrected geometry', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', proposal: {
      zones: [], warnings: [],
      nodes: [{ id: 'a', label: 'A', x: 20, y: 30 }, { id: 'b', label: 'B', x: 80, y: 30 }],
      connections: [{ id: 'link', fromNodeId: 'a', toNodeId: 'b', distanceUnits: 60, graphType: 'DOORWAY' }],
      wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }],
      doors: [{ id: 'opening', x1: 50, y1: 25, x2: 50, y2: 35 }]
    } })));
    component.generate(); fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('.tools button')] as HTMLButtonElement[];
    expect(buttons.find(button => button.textContent?.includes('Muro'))?.disabled).toBe(false);
    expect(buttons.find(button => button.textContent?.includes('Puerta'))?.disabled).toBe(false);
    expect(component.previewEditor.floorWalls()).toHaveLength(1);
    expect(component.previewEditor.floorDoors()).toHaveLength(1);
    const originalWall = component.previewEditor.floorWalls()[0];
    component.previewEditor.updateWall(originalWall.id, { x1: 50, y1: 5, x2: 50, y2: 55 });
    component.chooseTool('wall');
    component.canvasPoint(10, 5); component.canvasPoint(10, 55);
    expect(component.previewEditor.floorWalls()).toHaveLength(2);
    component.chooseTool('door');
    component.wallPicked({ id: component.previewEditor.floorWalls()[1].id, fraction: .5 });
    expect(component.previewEditor.floorDoors()).toHaveLength(2);
    component.undo(); expect(component.previewEditor.floorDoors()).toHaveLength(1);
    component.redo(); expect(component.previewEditor.floorDoors()).toHaveLength(2);
    component.applyProposal();
    expect(component.editor.floorWalls()).toHaveLength(2);
    expect(component.editor.floorWalls()[0]).toMatchObject({ x1: 50, y1: 5, x2: 50, y2: 55 });
    expect(component.editor.floorDoors()).toHaveLength(2);
    expect(component.editor.geometryError()).toBeNull();
  });

  it('locates a clicked proposal warning and a clicked connection conflict on the canvas', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: [],
      zones: [{ ...proposal.zones[0], name: 'ROOM 1' }],
      wallCandidates: [{ x1: 0, y1: 75, x2: 100, y2: 75 }]
    } })));
    component.generate(); fixture.detectChanges();
    const warning = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('no tiene una etiqueta confiable')) as HTMLButtonElement;
    expect(warning).toBeDefined();
    warning.click(); fixture.detectChanges();
    expect(component.selectedZoneId()).toBe('z1');
    expect(fixture.nativeElement.querySelector('.backdrop .zone.selected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('circle.alert-target')).not.toBeNull();

    const conflict = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('La conexión 1')) as HTMLButtonElement;
    expect(conflict).toBeDefined();
    conflict.click(); fixture.detectChanges();
    expect(component.previewEditor.selectedConnection()?.id).toBe('c1');
    expect(fixture.nativeElement.querySelector('line.edge.selected')).not.toBeNull();
    expect(component.tab()).toBe('alerts');
  });

  it('keeps an unresolved candidate connection visible in alerts and prevents silent loss on apply', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: [],
      connections: [{ id: 'orphan', fromNodeId: 'n1', toNodeId: 'missing', distanceUnits: 10 }] } })));
    component.generate();
    fixture.detectChanges();
    expect(component.proposal()?.connections.map(link => link.id)).toContain('orphan');
    expect(component.alerts().some(message => message.includes('Conexión candidata 1'))).toBe(true);
    expect(component.alerts().some(message => message.includes('orphan'))).toBe(false);
    expect(component.tab()).toBe('alerts');
    expect(component.canApply()).toBe(false);
    component.applyProposal();
    expect(component.notice()).toContain('conexiones sin nodos');
    expect(component.editor.graph().connections).toHaveLength(0);
  });

  it('warns when too few connections were detected for the rooms found', () => {
    create([svg]);
    const rooms = ['a', 'b', 'c'].map((id, index) => ({ id, name: id, category: 'ROOM', x: index * 10, y: 0, width: 10, height: 10 }));
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, zones: rooms, connections: [proposal.connections[0]] } })));
    component.generate();
    expect(component.alerts().some(message => message.includes('pocas conexiones (1) para 3 ambientes'))).toBe(true);
    plans.interpret.mockReturnValue(of(result()));
    component.generate();
    expect(component.alerts().some(message => message.includes('pocas conexiones'))).toBe(false);
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
    expect(component.tab()).toBe('alerts');
    component.selectZone('z1');
    expect(component.selectedZone()?.name).toBe('Consultorio 101');
    component.selectZone('z1');
    expect(component.selectedZone()).toBeNull();
  });

  it('edits generated nodes in memory and only changes the draft after applying the proposal', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', metersPerUnit: 0.5 })));
    component.generate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-graph-canvas')).not.toBeNull();
    const originalDraft = component.editor.graph();
    component.chooseTool('node');
    component.canvasPoint(20, 20);
    expect(component.proposal()?.nodes).toHaveLength(3);
    expect(component.editor.graph()).toBe(originalDraft);
    component.discardProposal();
    expect(component.editor.graph()).toBe(originalDraft);
    component.generate();
    component.chooseTool('node');
    component.canvasPoint(20, 20);
    component.applyProposal();
    expect(component.proposal()).toBeNull();
    expect(component.editor.graph().nodes).toHaveLength(3);
    expect(component.editor.dirty()).toBe(true);
  });

  it('discards the complete generated preview without changing or saving the draft', () => {
    const fixture = create([svg]);
    const originalDraft = component.editor.graph();
    component.generate(); fixture.detectChanges();
    expect(component.previewEditor.graph().nodes).not.toHaveLength(0);
    expect(component.previewEditor.graph().walls).not.toHaveLength(0);
    expect(component.proposalAlerts().length).toBeGreaterThan(0);

    const discard = [...fixture.nativeElement.querySelectorAll('.proposal-bar button')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Descartar')) as HTMLButtonElement;
    discard.click(); fixture.detectChanges();

    expect(component.proposal()).toBeNull();
    expect(component.previewEditor.graph().nodes).toHaveLength(0);
    expect(component.previewEditor.graph().walls ?? []).toHaveLength(0);
    expect(component.unadoptedGeometry()).toEqual({ wallCandidates: [], doors: [] });
    expect(component.proposalAlerts()).toHaveLength(0);
    expect(component.editor.graph()).toBe(originalDraft);
    expect(component.editor.dirty()).toBe(false);
    expect(drafts.save).not.toHaveBeenCalled();
  });

  describe('draft editing', () => {
    const addNode = (x: number, y: number) => { component.editor.setTool('node'); component.editor.canvasClick(x, y); };

    it('enables wall and door tools and saves their geometry with the draft', () => {
      create([svg]);
      component.chooseTool('wall');
      component.canvasPoint(20, 10); component.canvasPoint(20, 50);
      const wall = component.editor.selectedWall();
      expect(wall).not.toBeNull();
      component.chooseTool('door'); component.wallPicked({ id: wall!.id, fraction: .5 });
      expect(component.editor.selectedDoor()?.wallId).toBe(wall!.id);
      expect(component.canSave()).toBe(true);
      drafts.save.mockReturnValue(of(draft()));
      component.save();
      expect(drafts.save.mock.calls[0][1].walls).toHaveLength(1);
      expect(drafts.save.mock.calls[0][1].doors).toHaveLength(1);
    });

    it('shows recognized rooms and saved geometry without source-plan traces after reloading', () => {
      const graph = { nodes: [{ id: 'saved', floorId: 'floor', planVersionId: 'pv', x: 25, y: 30, type: 'INTERSECTION' }],
        connections: [], destinations: [],
        walls: [{ id: 'saved-wall', floorId: 'floor', planVersionId: 'pv', x1: 10, y1: 0, x2: 10, y2: 60 }],
        doors: [{ id: 'saved-door', wallId: 'saved-wall', from: .4, to: .6 }] };
      drafts.load.mockReturnValue(of(draft(0.5, graph)));
      const fixture = create([svg]);
      fixture.detectChanges();

      expect(plans.interpret).toHaveBeenCalledWith('site', 'floor', 'pv');
      expect(component.editor.graph().nodes).toEqual(graph.nodes);
      expect(component.backdrop()?.zones).toEqual(proposal.zones);
      expect(fixture.nativeElement.querySelector('.backdrop .zone')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.backdrop line')).toBeNull();
      expect(fixture.nativeElement.querySelector('.editable-wall')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.editable-door')).not.toBeNull();
    });

    it('loads the site draft into the editor on the selected floor', () => {
      create([svg]);
      expect(drafts.load).toHaveBeenCalledWith('site');
      expect(component.draft()?.etag).toBe('"rev-1"');
      expect(component.editor.floorId()).toBe('floor');
      expect(component.editor.plan()?.widthUnits).toBe(100);
    });

    it('starts the low-connectivity repair from a reachable node and updates the measured status', () => {
      const nodes = [
        { id: 'access', floorId: 'floor', planVersionId: 'pv', x: 0, y: 0, type: 'ACCESS' },
        { id: 'junction', floorId: 'floor', planVersionId: 'pv', x: 10, y: 0, type: 'INTERSECTION' },
        { id: 'room', floorId: 'floor', planVersionId: 'pv', x: 20, y: 0, type: 'DESTINATION' }
      ];
      const connections = [{ id: 'route', sourceNodeId: 'access', targetNodeId: 'junction',
        type: 'CORRIDOR', distanceMeters: 5, weight: 5, verticalPenalty: 0,
        accessibility: 'UNKNOWN' as const, bidirectional: true }];
      drafts.load.mockReturnValue(of(draft(0.5, { nodes, connections,
        destinations: [{ id: 'directory', nodeId: 'room', type: 'SERVICE', name: 'Consultorio', specialty: null }] })));
      create([svg]);
      expect(component.reachability()).toMatchObject({ reachable: 0, total: 1, percent: 0 });
      const alert = component.graphAlerts().find(item => item.code === 'DISCONNECTED_NODE' && item.elementId === 'room');
      expect(alert).toBeDefined();
      expect(component.canExtendTo(alert!)).toBe(true);
      component.extendTo(alert!);
      expect(component.editor.pendingFrom()).toBe('junction');
      expect(component.editor.tool()).toBe('edge');
      component.nodePicked('room');
      expect(component.reachability().percent).toBe(100);
      expect(component.editor.floorConnections()).toHaveLength(2);
    });

    it('shows an empty state when the site has no draft and keeps editing disabled', () => {
      drafts.load.mockReturnValue(of(null));
      create([svg]);
      expect(component.draft()).toBeNull();
      expect(component.canSave()).toBe(false);
    });

    it('saves edits with the loaded revision and adopts the next one', () => {
      create([svg]);
      addNode(10, 10);
      expect(component.canSave()).toBe(true);
      const saved = { ...draft(), etag: '"rev-2"', graph: component.editor.graph() };
      drafts.save.mockReturnValue(of(saved));
      component.save();
      expect(drafts.save).toHaveBeenCalledWith(expect.objectContaining({ etag: '"rev-1"' }), component.editor.graph());
      expect(component.draft()?.etag).toBe('"rev-2"');
      expect(component.editor.dirty()).toBe(false);
      expect(component.success()).toBe('Borrador guardado.');
      expect(component.editor.floorId()).toBe('floor');
    });

    it('keeps local edits and offers a reload when the draft is stale (412)', () => {
      create([svg]);
      addNode(10, 10);
      drafts.save.mockReturnValue(throwError(() => new HttpError({ status: 412, error: { code: 'STALE_DRAFT_GRAPH' } })));
      component.save();
      expect(component.saveFailure()?.kind).toBe('stale');
      expect(component.editor.dirty()).toBe(true);
      expect(component.editor.graph().nodes).toHaveLength(1);
    });

    it('turns server validation issues into selectable alerts without losing edits (422)', () => {
      create([svg]);
      addNode(10, 10);
      const nodeId = component.editor.graph().nodes[0].id;
      drafts.save.mockReturnValue(throwError(() => new HttpError({
        status: 422, error: { code: 'INVALID_MAP_GRAPH', issues: [{ code: 'INVALID_NODE_DATA', elementType: 'NODE', elementId: nodeId, message: 'x' }] }
      })));
      component.save();
      expect(component.saveFailure()?.kind).toBe('invalid');
      expect(component.tab()).toBe('alerts');
      const alert = component.graphAlerts().find(item => item.code === 'INVALID_NODE_DATA');
      expect(alert).toBeDefined();
      component.focusAlert(alert!);
      expect(component.editor.selectedNode()?.id).toBe(nodeId);
      expect(component.tab()).toBe('properties');
    });

    it('recovers from an offline failure by retrying the same save', () => {
      create([svg]);
      addNode(10, 10);
      drafts.save.mockReturnValueOnce(throwError(() => new HttpError({ status: 0 })));
      component.save();
      expect(component.saveFailure()?.kind).toBe('offline');
      drafts.save.mockReturnValueOnce(of({ ...draft(), etag: '"rev-2"', graph: component.editor.graph() }));
      component.save();
      expect(component.saveFailure()).toBeNull();
      expect(component.editor.dirty()).toBe(false);
    });

    it('applies the node form: type, position and directory entry', () => {
      create([svg]);
      addNode(10, 10);
      const id = component.editor.graph().nodes[0].id;
      component.nodeForm.patchValue({ type: 'DESTINATION', x: 30, y: 40 });
      component.destinationForm.patchValue({ name: 'Caja', type: 'SERVICE', specialty: '' });
      component.applyNode();
      expect(component.editor.graph().nodes[0]).toMatchObject({ id, type: 'DESTINATION', x: 30, y: 40 });
      expect(component.editor.graph().destinations[0]).toMatchObject({ name: 'Caja', specialty: null });
    });

    it('does not apply a destination without a name', () => {
      create([svg]);
      addNode(10, 10);
      component.nodeForm.patchValue({ type: 'DESTINATION' });
      component.destinationForm.patchValue({ name: '   ' });
      component.applyNode();
      expect(component.editor.graph().destinations).toEqual([]);
    });

    it('applies the connection form to the selected edge', () => {
      create([svg]);
      addNode(0, 0); addNode(10, 0);
      component.editor.setTool('edge');
      const [a, b] = component.editor.graph().nodes;
      component.editor.nodeClick(a.id); component.editor.nodeClick(b.id);
      component.connectionForm.patchValue({ type: 'DOORWAY', distanceMeters: 7, bidirectional: false });
      component.applyConnection();
      expect(component.editor.graph().connections[0]).toMatchObject({ type: 'DOORWAY', distanceMeters: 7, bidirectional: false });
    });

    it('applies a generated proposal to the draft when the scale is confirmed', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED' })));
      component.generate();
      component.applyProposal();
      expect(component.proposal()).toBeNull();
      expect(component.editor.graph().nodes).toHaveLength(2);
      expect(component.editor.dirty()).toBe(true);
      expect(component.success()).toContain('Propuesta aplicada');
      expect(component.backdrop()?.zones.length).toBe(1);
    });

    it('refuses to apply a proposal while the scale is not calibrated and keeps the preview', () => {
      drafts.load.mockReturnValue(of(draft(null)));
      create([svg]);
      plans.interpret.mockReturnValue(of(result()));
      component.generate();
      component.applyProposal();
      expect(component.proposal()).not.toBeNull();
      expect(component.notice()).toContain('Calibra la escala');
      expect(component.editor.graph().nodes).toHaveLength(0);
    });

    it('creates the first draft when applying a proposal to a site without one', () => {
      drafts.load.mockReturnValue(of(null));
      drafts.createFirstDraft.mockReturnValue(of(draft(0.5)));
      create([svg]);
      plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED' })));
      component.generate();
      expect(component.canApply()).toBe(true);
      component.applyProposal();
      expect(drafts.createFirstDraft).toHaveBeenCalledWith('site', [{ floorId: 'floor', planVersionId: 'v2' }]);
      expect(component.draft()?.etag).toBe('"rev-1"');
      expect(component.proposal()).toBeNull();
      expect(component.editor.graph().nodes).toHaveLength(2);
      expect(component.success()).toContain('Propuesta aplicada');
    });

    it('keeps the preview when the first draft cannot be created', () => {
      drafts.load.mockReturnValue(of(null));
      drafts.createFirstDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      create([svg]);
      plans.interpret.mockReturnValue(of(result()));
      component.generate();
      component.applyProposal();
      expect(component.proposal()).not.toBeNull();
      expect(component.draft()).toBeNull();
      expect(component.error()).toContain('No hay conexión');
    });
  });

  describe('first draft of a site without a map', () => {
    it('creates an empty draft from the selected plan and enables editing', () => {
      drafts.load.mockReturnValue(of(null));
      drafts.createFirstDraft.mockReturnValue(of(draft(0.5)));
      create([svg]);
      expect(component.canCreateDraft()).toBe(true);
      component.createDraft();
      expect(drafts.createFirstDraft).toHaveBeenCalledWith('site', [{ floorId: 'floor', planVersionId: 'v2' }]);
      expect(component.draft()?.plans[0].metersPerUnit).toBe(0.5);
      expect(component.editor.plan()?.widthUnits).toBe(100);
      expect(component.canCreateDraft()).toBe(false);
      expect(component.success()).toContain('Borrador creado');
    });

    it('cannot create a draft without a plan or when one is already loaded', () => {
      drafts.load.mockReturnValue(of(null));
      create([]);
      expect(component.canCreateDraft()).toBe(false);
      component.createDraft();
      expect(drafts.createFirstDraft).not.toHaveBeenCalled();
      drafts.load.mockReturnValue(of(draft()));
      create([svg]);
      expect(component.canCreateDraft()).toBe(false);
    });

    it('loads the existing draft when another session created it first', () => {
      drafts.load.mockReturnValueOnce(of(null)).mockReturnValueOnce(of(draft()));
      drafts.createFirstDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'DRAFT_ALREADY_EXISTS' } })));
      create([svg]);
      component.createDraft();
      expect(drafts.load).toHaveBeenCalledTimes(2);
      expect(component.draft()?.etag).toBe('"rev-1"');
      expect(component.notice()).toContain('ya tenía un borrador');
    });

    it('explains that a site with a published map needs a new version instead', () => {
      drafts.load.mockReturnValue(of(null));
      drafts.createFirstDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'SITE_MAP_ALREADY_EXISTS' } })));
      create([svg]);
      component.createDraft();
      expect(component.draft()).toBeNull();
      expect(component.error()).toContain('mapa publicado');
    });
  });

  describe('labels in the generated model', () => {
    it('keeps labels the plan provides and flags generated names as unreliable', () => {
      create([svg]);
      const zones = [
        { id: 'a', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', name: 'ROOM 2', category: 'ROOM', x: 20, y: 0, width: 10, height: 10 }
      ];
      plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, zones, connections: [proposal.connections[0]] } })));
      component.generate();
      expect(component.proposal()?.zones.map(zone => zone.name)).toEqual(['Consultorio 101', 'ROOM 2']);
      expect(component.unlabeled().map(zone => zone.id)).toEqual(['b']);
      expect(component.unlabeledZone(zones[0])).toBe(false);
      expect(component.unlabeledZone(zones[1])).toBe(true);
      expect(component.alerts().some(message => message.includes('«ROOM 2» no tiene una etiqueta confiable'))).toBe(true);
      expect(component.tab()).toBe('alerts');
    });

    it('flags every zone when the SVG has no text at all', () => {
      create([svg]);
      const zones = ['ROOM 1', 'ROOM 2', 'CORRIDOR 3'].map((name, index) => ({ id: `z${index}`, name, category: 'ROOM', x: index * 10, y: 0, width: 10, height: 10 }));
      plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, zones, warnings: [] } })));
      component.generate();
      expect(component.unlabeled()).toHaveLength(3);
      expect(component.alerts().filter(message => message.includes('no tiene una etiqueta confiable'))).toHaveLength(3);
    });
  });

  describe('classification and network', () => {
    const rooms = [
      { id: 'zone-0', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 10, height: 10 },
      { id: 'zone-1', name: 'ROOM 2', category: 'ROOM', x: 20, y: 0, width: 10, height: 10 },
      { id: 'zone-2', name: 'Pasillo A', category: 'CORRIDOR', x: 0, y: 20, width: 30, height: 5 }
    ];
    const richProposal = (): ModelProposal => ({
      ...proposal, zones: rooms, warnings: [],
      nodes: rooms.map(zone => ({ id: zone.id, label: zone.name, x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 })),
      connections: [{ id: 'k', fromNodeId: 'zone-0', toNodeId: 'zone-2', distanceUnits: 10 }],
      doors: [{ id: 'door-0', x1: 5, y1: 10, x2: 5, y2: 12 }]
    });
    const withRooms = () => result({ proposal: richProposal() });

    it('counts the recognized doors', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      expect(component.summary()?.doors).toBe(1);
    });

    it('alerts about rooms that the recognized network does not reach', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      expect(component.isolated().map(zone => zone.id)).toEqual(['zone-1']);
      expect(component.isIsolated('zone-1')).toBe(true);
      expect(component.alerts().some(message => message.includes('«ROOM 2» queda fuera de la red de recorridos'))).toBe(true);
    });

    it('lets the author name an unlabeled room and change its type, then revert it', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      component.selectZone('zone-1');
      TestBed.tick();
      expect(component.zoneForm.getRawValue()).toEqual({ name: 'ROOM 2', category: 'ROOM' });
      component.zoneForm.patchValue({ name: 'Triaje', category: 'SERVICE' });
      component.applyZoneCorrection();
      expect(component.proposal()?.zones[1]).toMatchObject({ name: 'Triaje', category: 'SERVICE' });
      expect(component.unlabeled()).toHaveLength(0);
      expect(component.success()).toContain('Ambiente corregido');
      component.resetZone();
      expect(component.proposal()?.zones[1]).toMatchObject({ name: 'ROOM 2', category: 'ROOM' });
      expect(component.unlabeled()).toHaveLength(1);
    });

    it('rejects an empty name for the correction', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      component.selectZone('zone-1');
      component.zoneForm.patchValue({ name: '   ' });
      component.applyZoneCorrection();
      expect(component.proposal()?.zones[1].name).toBe('ROOM 2');
    });

    it('applies corrected classifications to the draft as destinations', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      component.scaleProvisional.set(false);
      component.selectZone('zone-1');
      component.zoneForm.patchValue({ name: 'Triaje', category: 'SERVICE' });
      component.applyZoneCorrection();
      component.applyProposal();
      const names = component.editor.graph().destinations.map(entry => entry.name).sort();
      expect(names).toEqual(['Consultorio 101', 'Triaje']);
    });

    it('highlights a connection chosen from the network list and toggles it', () => {
      create([svg]);
      plans.interpret.mockReturnValue(of(withRooms()));
      component.generate();
      component.selectLink('k');
      expect(component.selectedLinkId()).toBe('k');
      component.selectLink('k');
      expect(component.selectedLinkId()).toBeNull();
    });
  });
});

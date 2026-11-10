import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { SitesService } from '../../../../core/services/sites.service';
import { FloorPlansService, PlanInterpretation, PlanVersion } from '../floor-plan-calibration/floor-plans.service';
import { MapEditorComponent } from './map-editor.component';
import { ModelProposal } from './model-preview';
import { DraftSnapshot, MapEditorApiService } from '../../infrastructure/map-editor-api.service';
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
      providers: [provideRouter([]), { provide: SitesService, useValue: sites },
        { provide: FloorPlansService, useValue: plans }, { provide: MapEditorApiService, useValue: drafts }, { provide: AuthService, useValue: {} }]
    });
  });

  it('selects the current plan and enables generation for any stored format', () => {
    create([svg, pdf]);
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
    expect(component.alerts().some(message => message.includes('provisional'))).toBe(true);
    expect(component.connectionLine(proposal.connections[0])).toEqual({ x1: 50, y1: 60, x2: 50, y2: 90 });
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
    expect(component.tab()).toBe('properties');
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

  describe('draft editing', () => {
    const addNode = (x: number, y: number) => { component.editor.setTool('node'); component.editor.canvasClick(x, y); };

    it('restores rooms and walls from the draft plan while keeping the saved graph', () => {
      const graph = { nodes: [{ id: 'saved', floorId: 'floor', planVersionId: 'pv', x: 25, y: 30, type: 'INTERSECTION' }],
        connections: [], destinations: [] };
      drafts.load.mockReturnValue(of(draft(0.5, graph)));
      const fixture = create([svg]);
      fixture.detectChanges();

      expect(plans.interpret).toHaveBeenCalledWith('site', 'floor', 'pv');
      expect(component.editor.graph().nodes).toEqual(graph.nodes);
      expect(component.backdrop()?.zones).toEqual(proposal.zones);
      expect(fixture.nativeElement.querySelector('.backdrop .zone')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.backdrop line')).not.toBeNull();
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
      expect(component.alerts().some(message => message.includes('1 ambiente no tiene una etiqueta confiable'))).toBe(true);
      expect(component.tab()).toBe('alerts');
    });

    it('flags every zone when the SVG has no text at all', () => {
      create([svg]);
      const zones = ['ROOM 1', 'ROOM 2', 'CORRIDOR 3'].map((name, index) => ({ id: `z${index}`, name, category: 'ROOM', x: index * 10, y: 0, width: 10, height: 10 }));
      plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, zones, warnings: [] } })));
      component.generate();
      expect(component.unlabeled()).toHaveLength(3);
      expect(component.alerts().some(message => message.includes('3 ambientes no tienen una etiqueta confiable'))).toBe(true);
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
      expect(component.alerts().some(message => message.includes('fuera de la red de recorridos: ROOM 2'))).toBe(true);
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

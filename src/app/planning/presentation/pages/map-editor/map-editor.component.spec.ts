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
import piso2Proposal from '../../../application/piso2-proposal.fixture.json';
import calibratedPiso2 from '../../../application/piso2-calibrated-proposal.fixture.json';
import { PlanReconciliationReview } from '../../../application/reconcile-plan-proposal';

describe('MapEditorComponent', () => {
  const site = { id: 'site', name: 'Sede Central', address: null, clinicId: 'c' };
  const floor = { id: 'floor', siteId: 'site', number: 2, name: 'Piso 2', description: null };
  const svg: PlanVersion = { id: 'v2', version: 2, fileName: 'piso2.svg', mediaType: 'image/svg+xml', sizeBytes: 10, createdAt: '' };
  const pdf: PlanVersion = { ...svg, id: 'v1', version: 1, fileName: 'piso2.pdf', mediaType: 'application/pdf' };
  const proposal = {
    zones: [{ id: 'z1', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 100, height: 60 }],
    nodes: [{ id: 'n1', label: 'N-01', role: 'ACCESS', x: 50, y: 60 },
      { id: 'n2', label: 'N-02', role: 'DESTINATION', x: 50, y: 90 }],
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
  const drafts = { load: vi.fn(), save: vi.fn(), createFirstDraft: vi.fn(), publish: vi.fn() };
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

  const prepareReconciliation = (fixture: { detectChanges(): void }) => {
    const currentPlan = { floorId: 'floor', planVersionId: 'pv', widthUnits: 100, heightUnits: 100, metersPerUnit: 1 };
    component.floors.set([floor, { ...floor, id: 'floor-3', number: 3, name: 'Piso 3' }]);
    component.editor.load({
      nodes: [
        { id: 'saved-room', floorId: 'floor', planVersionId: 'pv', x: 10, y: 10, type: 'DESTINATION' },
        { id: 'remote', floorId: 'floor-3', planVersionId: 'pv-3', x: 10, y: 10, type: 'VERTICAL_LINK' }
      ],
      connections: [{ id: 'vertical', sourceNodeId: 'saved-room', targetNodeId: 'remote', type: 'ELEVATOR',
        distanceMeters: 4, weight: 5, verticalPenalty: 1, accessibility: 'ACCESSIBLE', bidirectional: true }],
      destinations: [{ id: 'saved-destination', nodeId: 'saved-room', type: 'SERVICE',
        name: 'Cardiología', specialty: null }], walls: [], doors: []
    }, [currentPlan]);
    component.editor.floorId.set('floor');
    component.backdrop.set({ zones: [{ id: 'old-zone', name: 'Cardiología', category: 'SERVICE',
      x: 0, y: 0, width: 20, height: 20 }], nodes: [], connections: [], wallCandidates: [], warnings: [] });
    const candidate: ModelProposal = {
      zones: [
        { id: 'z-new', name: 'Sala nueva', category: 'ROOM', x: 40, y: 30, width: 30, height: 30 },
        { id: 'z-auto', name: 'Pasillo principal', category: 'CORRIDOR', x: 0, y: 0, width: 100, height: 20 }
      ],
      nodes: [
        { id: 'access', label: 'Acceso', role: 'ACCESS', x: 0, y: 40 },
        { id: 'z-new', label: 'Sala nueva', role: 'DESTINATION', x: 55, y: 45 }
      ],
      connections: [{ id: 'route', fromNodeId: 'access', toNodeId: 'z-new', distanceUnits: 55, graphType: 'CORRIDOR' }],
      wallCandidates: [], warnings: []
    };
    component.proposal.set(candidate);
    component.previewEditor.load({
      nodes: [
        { id: 'access', floorId: 'floor', planVersionId: 'pv', x: 0, y: 40, type: 'ACCESS' },
        { id: 'z-new', floorId: 'floor', planVersionId: 'pv', x: 55, y: 45, type: 'DESTINATION' }
      ],
      connections: [{ id: 'route', sourceNodeId: 'access', targetNodeId: 'z-new', type: 'CORRIDOR',
        distanceMeters: 55, weight: 55, verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true }],
      destinations: [{ id: 'preview-destination', nodeId: 'z-new', type: 'SERVICE', name: 'Sala nueva', specialty: null }],
      walls: [], doors: []
    }, [currentPlan]);
    component.previewEditor.floorId.set('floor');
    const review: PlanReconciliationReview = { change: 'MOVED', previousZoneIds: ['old-zone'],
      proposedZoneIds: ['z-new'], reason: 'El ambiente cambió de posición.',
      destinationIds: ['saved-destination'], verticalConnectionIds: ['vertical'] };
    component.reconciliationReview.set([review]);
    component.reconciliationDecisions.set({});
    component.tab.set('reconciliation');
    fixture.detectChanges();
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

  function savedPublishableDraft(): DraftSnapshot {
    return draft(0.5, {
      nodes: [{ id: 'a', floorId: 'floor', planVersionId: 'pv', x: 1, y: 1, type: 'ACCESS' },
        { id: 'b', floorId: 'floor', planVersionId: 'pv', x: 5, y: 1, type: 'DESTINATION' }],
      connections: [{ id: 'ab', sourceNodeId: 'a', targetNodeId: 'b', type: 'CORRIDOR',
        distanceMeters: 2, weight: 2, verticalPenalty: 0, accessibility: 'ACCESSIBLE', bidirectional: true }],
      destinations: [{ id: 'destination', nodeId: 'b', name: 'Recepción', type: 'SERVICE', specialty: null }],
      walls: [], doors: []
    });
  }

  it('requires a saved calibrated draft and explicit review before publishing', () => {
    drafts.load.mockReturnValue(of(savedPublishableDraft()));
    create([svg]);
    expect(component.canPublish()).toBe(true);
    component.publish();
    expect(drafts.publish).not.toHaveBeenCalled();
    component.editor.moveTo('a', 2, 1);
    expect(component.canPublish()).toBe(false);
    component.editor.load(savedPublishableDraft().graph, [{ ...savedPublishableDraft().plans[0], metersPerUnit: null }]);
    expect(component.canPublish()).toBe(false);
  });

  it('publishes after confirmation and removes the editable workspace', () => {
    const snapshot = savedPublishableDraft();
    drafts.load.mockReturnValue(of(snapshot));
    drafts.publish.mockReturnValue(of({ siteId: 'site', mapId: 'm', modelVersionId: 'v', status: 'PUBLISHED' }));
    const fixture = create([svg]);
    component.reviewPublication();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Confirmar publicación');
    component.publish();
    fixture.detectChanges();
    expect(drafts.publish).toHaveBeenCalledWith(snapshot);
    expect(component.publishedVersion()).toBe('v');
    expect(component.canPublish()).toBe(false);
    expect(fixture.nativeElement.querySelector('.editor')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Mapa publicado');
  });

  it('keeps the draft after rejection and shows beacon observations', () => {
    drafts.load.mockReturnValue(of(savedPublishableDraft()));
    drafts.publish.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422,
      error: { issues: [{ code: 'INVALID_BEACON_PLACEMENT', elementType: 'BEACON', elementId: 'beacon', message: 'Outside floor' }] } })));
    create([svg]);
    component.reviewPublication();
    component.publish();
    expect(component.publishedVersion()).toBeNull();
    expect(component.draft()).not.toBeNull();
    expect(component.serverAlerts()[0].code).toBe('INVALID_BEACON_PLACEMENT');
    expect(component.canPublish()).toBe(false);
  });

  it('requires another review after a stale revision response', () => {
    drafts.load.mockReturnValue(of(savedPublishableDraft()));
    drafts.publish.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 412 })));
    create([svg]);
    component.reviewPublication();
    component.publish();
    expect(component.publicationReview()).toBe(false);
    expect(component.publicationFailure()).toContain('El borrador cambió');
    expect(component.publishedVersion()).toBeNull();
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

  it('applies and saves the validated piso2.jpg proposal without manual graph corrections', () => {
    const savedPlan = draft(1);
    savedPlan.plans = [{ floorId: 'floor', planVersionId: 'v2', widthUnits: 768,
      heightUnits: 576, metersPerUnit: 1 }];
    drafts.load.mockReturnValue(of(savedPlan));
    create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED',
      proposal: piso2Proposal as ModelProposal })));
    component.generate();
    expect(component.previewValidationErrors()).toEqual([]);
    expect(component.canApply()).toBe(true);
    component.applyProposal();
    expect(component.editor.floorDoors()).toHaveLength(10);
    expect(component.editor.geometryError()).toBeNull();
    expect(component.canSave()).toBe(true);
    drafts.save.mockReturnValue(of(draft(0.5, component.editor.graph())));
    component.save();
    expect(drafts.save).toHaveBeenCalledOnce();
    expect(component.editor.dirty()).toBe(false);
  });

  it('applies the calibrated piso2 proposal with an access, ROOM 2 and no alerts', () => {
    const olderFloorNodes: DraftSnapshot['graph']['nodes'] = Array.from({ length: 31 }, (_, index) => ({
      id: `old-${index}`, floorId: 'other-floor', planVersionId: 'other-plan',
      x: index, y: 10, type: 'INTERSECTION'
    }));
    const savedPlan = draft(0.05, { nodes: olderFloorNodes, connections: [], destinations: [] });
    savedPlan.plans = [{ floorId: 'floor', planVersionId: 'v2', widthUnits: 768, heightUnits: 576, metersPerUnit: 0.05 }];
    drafts.load.mockReturnValue(of(savedPlan));
    create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', metersPerUnit: 0.05,
      proposal: calibratedPiso2 as ModelProposal })));
    component.generate();
    expect(component.alerts()).toEqual([]);
    expect(component.previewEditor.floorNodes().filter(node => node.type === 'ACCESS')).toHaveLength(1);
    expect(component.summary()).toMatchObject({ zones: 11, nodes: 24, connections: 23, doors: 10 });
    // Synchronizing a preview edit must not copy nodes from the other floor into the proposal.
    const first = component.previewEditor.floorNodes()[0];
    component.nodeMoved(first.id, first.x, first.y);
    expect(component.summary()?.nodes).toBe(24);
    expect(component.canApply()).toBe(true);
    component.applyProposal();
    expect(component.editor.graph().destinations.map(destination => destination.name)).toContain('ROOM 2');
    expect(component.editor.graph().nodes.filter(node => node.floorId === 'other-floor')).toEqual(olderFloorNodes);
    expect(component.graphAlerts().filter(issue => issue.code === 'DISCONNECTED_NODE')).toHaveLength(31);
    expect(component.reachability()).toMatchObject({ reachable: 8, total: 8 });
    expect(component.editor.geometryError()).toBeNull();
    expect(component.canSave()).toBe(true);
    drafts.save.mockReturnValue(of(draft(0.05, component.editor.graph())));
    component.save();
    expect(drafts.save).toHaveBeenCalledOnce();
  });

  it('groups real disconnections on the proposed floor and keeps Apply blocked', () => {
    create([svg]);
    const candidate = calibratedPiso2 as ModelProposal;
    plans.interpret.mockReturnValue(of(result({ proposal: { ...candidate, nodes: [
      ...candidate.nodes, { id: 'isolated-a', label: 'A', x: 100, y: 100 },
      { id: 'isolated-b', label: 'B', x: 110, y: 110 }
    ] } })));
    component.generate();
    expect(component.previewValidationErrors().filter(issue => issue.code === 'DISCONNECTED_NODE')).toHaveLength(2);
    const group = component.proposalAlerts().filter(alert => alert.message.includes('nodos sin ruta'));
    expect(group).toEqual([expect.objectContaining({ message: expect.stringContaining('2 nodos'), target: {
      kind: 'node', id: 'isolated-a'
    } })]);
    expect(component.canApply()).toBe(false);
  });

  it('explains when the generated floor is not registered in the draft', () => {
    const existing = draft();
    existing.plans = [{ ...existing.plans[0], floorId: 'other-floor' }];
    drafts.load.mockReturnValue(of(existing));
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: calibratedPiso2 as ModelProposal })));
    component.generate();
    fixture.detectChanges();
    expect(component.alerts()).toEqual([]);
    expect(component.canApply()).toBe(false);
    expect(fixture.nativeElement.querySelector('.canvas').textContent).toContain('no está registrado en el borrador');
  });

  it('marks a saved cross-floor connector on its local node without drawing a horizontal edge', () => {
    sites.loadFloors.mockReturnValue(of([floor,
      { ...floor, id: 'other-floor', number: 3, name: 'Piso 3' }]));
    drafts.load.mockReturnValue(of(draft(0.5, {
      nodes: [
        { id: 'local', floorId: 'floor', planVersionId: 'pv', x: 20, y: 20, type: 'VERTICAL_LINK' },
        { id: 'remote', floorId: 'other-floor', planVersionId: 'pv-3', x: 20, y: 20, type: 'VERTICAL_LINK' },
      ],
      connections: [{ id: 'vertical', sourceNodeId: 'local', targetNodeId: 'remote', type: 'ELEVATOR',
        distanceMeters: 5, weight: 6, verticalPenalty: 2, accessibility: 'ACCESSIBLE', bidirectional: true }],
      destinations: [], walls: [], doors: [],
    })));
    const fixture = create([svg]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg.canvas .vertical-marker')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('svg.canvas .edge')).toHaveLength(0);
    component.editor.select({ kind: 'node', id: 'local' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side').textContent).toContain('Ascensor hacia Piso 3');
    expect(fixture.nativeElement.querySelector('.side').textContent).toContain('costo 8');
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

  it('generates a preview without saving and keeps scale guidance outside alerts', () => {
    create([svg]);
    plans.interpret.mockReturnValue(of(result()));
    component.generate();
    expect(plans.interpret).toHaveBeenCalledWith('site', 'floor', 'v2');
    expect(component.summary()).toEqual({ zones: 1, nodes: 2, connections: 1, walls: 1, doors: 0 });
    expect(component.tab()).toBe('alerts');
    expect(component.alerts()).toContain('Etiqueta ambigua');
    expect(component.alerts()).toContain('No se reconocieron puertas en este plano. Revisa los muros y agrega las aberturas manualmente antes de crear rutas por ellas.');
    expect(component.alerts().some(message => message.includes('provisional'))).toBe(false);
    expect(component.scaleProvisional()).toBe(true);
    expect(component.connectionLine(proposal.connections[0])).toEqual({ x1: 50, y1: 60, x2: 50, y2: 90 });
  });

  it('shows automatic matches and blocks applying while reconciliation conflicts remain', () => {
    const fixture = create([svg]);
    prepareReconciliation(fixture);

    expect(component.pendingReconciliation()).toHaveLength(1);
    expect(component.canApply()).toBe(false);
    expect(fixture.nativeElement.querySelector('.reconciliation-panel').textContent).toContain('Correspondencias automáticas');
    expect(fixture.nativeElement.querySelector('.reconciliation-panel').textContent).toContain('Destino: Cardiología');
    expect(fixture.nativeElement.querySelector('.reconciliation-panel').textContent).toContain('Ascensor · Piso 3');
    component.applyProposal();
    expect(component.notice()).toContain('Resuelve todos los cambios obligatorios');
  });

  it('approves a pending change without losing edits made on the preview', () => {
    const fixture = create([svg]);
    prepareReconciliation(fixture);
    component.nodeMoved('z-new', 56, 44);
    component.approveReconciliation(0);

    expect(component.pendingReconciliation()).toEqual([]);
    expect(component.previewEditor.graph().nodes.find(node => node.id === 'z-new')).toMatchObject({ x: 56, y: 44 });
    expect(component.canApply()).toBe(true);
  });

  it('reassigns affected destinations and vertical links to the chosen room when applying', () => {
    const fixture = create([svg]);
    prepareReconciliation(fixture);
    component.nodeMoved('z-new', 58, 46);
    component.reassignReconciliation(0, 'z-new');

    expect(component.invalidReassignments()).toEqual([]);
    expect(component.previewEditor.graph().nodes.find(node => node.id === 'z-new')).toMatchObject({ x: 58, y: 46 });
    component.applyProposal();
    expect(component.editor.graph().nodes.find(node => node.id === 'saved-room')).toMatchObject({ x: 58, y: 46 });
    expect(component.editor.graph().destinations).toContainEqual(expect.objectContaining({ id: 'saved-destination', nodeId: 'saved-room' }));
    expect(component.editor.graph().connections).toContainEqual(expect.objectContaining({ id: 'vertical', type: 'ELEVATOR' }));
    expect(component.editor.graph().connections).toContainEqual(expect.objectContaining({ targetNodeId: 'saved-room', type: 'CORRIDOR' }));
    expect(component.editor.graph().nodes.filter(node => node.type === 'DESTINATION')).toHaveLength(1);
  });

  it('discards only the selected proposal and preserves unrelated preview edits', () => {
    const fixture = create([svg]);
    prepareReconciliation(fixture);
    component.previewEditor.setTool('node');
    component.previewEditor.canvasClick(75, 75);
    const manualId = component.previewEditor.graph().nodes.find(node => node.x === 75 && node.y === 75)?.id;
    component.discardReconciliation(0);

    expect(component.proposal()?.zones.some(zone => zone.id === 'z-new')).toBe(false);
    expect(component.previewEditor.graph().nodes.some(node => node.id === 'z-new')).toBe(false);
    expect(component.previewEditor.graph().nodes.some(node => node.id === manualId)).toBe(true);
    expect(component.reconciliationDecisions()[0].action).toBe('DISCARDED');
  });

  it('keeps the draft intact if a reassignment target no longer has a node', () => {
    const fixture = create([svg]);
    prepareReconciliation(fixture);
    const saved = component.editor.graph();
    component.reassignReconciliation(0, 'z-auto');
    expect(component.invalidReassignments()).toHaveLength(1);
    expect(component.canApply()).toBe(false);
    component.applyProposal();
    expect(component.editor.graph()).toEqual(saved);
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

  it('shows every recognized layer and excludes a route crossing a solid wall', () => {
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
    expect(fixture.nativeElement.querySelectorAll('line.edge')).toHaveLength(0);
    expect(component.alerts().some(message => message.includes('Se excluyeron 1 conexiones'))).toBe(true);
    expect(component.alerts().some(message => message.includes('Puerta candidata 1'))).toBe(true);
    expect(component.canApply()).toBe(false);
    component.applyProposal();
    expect(component.previewEditor.floorWalls()).toHaveLength(1);
    expect(component.editor.floorWalls()).toHaveLength(0);
    expect(component.editor.graph().connections).toHaveLength(0);
    expect(component.editor.geometryError()).toBeNull();
  });

  it('edits recognized walls and doors in the proposal and applies the corrected geometry', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', proposal: {
      zones: [], warnings: [],
      nodes: [{ id: 'a', label: 'A', role: 'ACCESS', x: 20, y: 30 },
        { id: 'b', label: 'B', role: 'DESTINATION', x: 80, y: 30 }],
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
    const doorHit = fixture.nativeElement.querySelector('svg.canvas .door-selection [aria-label="Puerta"]') as SVGLineElement;
    const edgeHit = fixture.nativeElement.querySelector('svg.canvas .edge-hit') as SVGLineElement;
    expect(edgeHit.compareDocumentPosition(doorHit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    doorHit.dispatchEvent(new MouseEvent('click', { bubbles: true })); fixture.detectChanges();
    expect(component.previewEditor.selectedDoor()?.id).toBe(component.previewEditor.floorDoors()[0].id);
    expect(fixture.nativeElement.querySelector('.side').textContent).toContain('Propiedades de la puerta');
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

  it('shows an unmatched recognized door for review without offering an unsafe association', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED', proposal: {
      zones: [], warnings: [], nodes: [], connections: [],
      wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }],
      doors: [{ id: 'candidate', x1: 10, y1: 5, x2: 10, y2: 15 }]
    } })));
    component.generate(); fixture.detectChanges();
    const hit = fixture.nativeElement.querySelector('.candidate-hit') as SVGLineElement;
    expect(hit).not.toBeNull();
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side').textContent).toContain('Puerta reconocida');
    expect(component.previewEditor.floorDoors()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.side').textContent).toContain('No se pudo asociar');
    expect(fixture.nativeElement.querySelector('.side').textContent).not.toContain('Incorporar puerta');
  });

  it('locates a clicked proposal warning and a clicked connection conflict on the canvas', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: ['Zona z1: revisa su nombre'],
      zones: [{ ...proposal.zones[0], name: 'ROOM 1' }],
      wallCandidates: [{ x1: 0, y1: 75, x2: 100, y2: 75 }]
    } })));
    component.generate(); fixture.detectChanges();
    const warning = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('revisa su nombre')) as HTMLButtonElement;
    expect(warning).toBeDefined();
    warning.click(); fixture.detectChanges();
    expect(component.selectedZoneId()).toBe('z1');
    expect(fixture.nativeElement.querySelector('.backdrop .zone.selected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('circle.alert-target')).not.toBeNull();

    const conflict = [...fixture.nativeElement.querySelectorAll('.alerts .alert-item')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Se excluyeron 1 conexiones')) as HTMLButtonElement;
    expect(conflict).toBeDefined();
    conflict.click(); fixture.detectChanges();
    expect(component.previewEditor.selectedConnection()).toBeNull();
    expect(fixture.nativeElement.querySelector('line.edge.selected')).toBeNull();
    expect(component.tab()).toBe('alerts');
  });

  it('excludes an unresolved candidate connection and reports the reason', () => {
    const fixture = create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: [],
      connections: [{ id: 'orphan', fromNodeId: 'n1', toNodeId: 'missing', distanceUnits: 10 }] } })));
    component.generate();
    fixture.detectChanges();
    expect(component.proposal()?.connections.map(link => link.id)).not.toContain('orphan');
    expect(component.alerts().some(message => message.includes('extremos inválidos'))).toBe(true);
    expect(component.alerts().some(message => message.includes('orphan'))).toBe(false);
    expect(component.tab()).toBe('alerts');
    component.applyProposal();
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
    plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, warnings: [], wallCandidates: [] } })));
    component.generate();
    component.setTab('properties');
    expect(component.tab()).toBe('properties');
    component.selectZone('z1');
    expect(component.selectedZone()?.name).toBe('Consultorio 101');
    component.selectZone('z1');
    expect(component.selectedZone()).toBeNull();
  });

  it('keeps generated edits in memory and blocks a disconnected added node', () => {
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
    expect(component.proposal()).not.toBeNull();
    expect(component.editor.graph().nodes).toHaveLength(0);
    expect(component.notice()).toContain('errores de integridad');
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

    it('confirms dependent destinations and connections before deleting, then saves and reloads unrelated geometry', () => {
      const wall = { id: 'wall', floorId: 'floor', planVersionId: 'pv', x1: 50, y1: 0, x2: 50, y2: 60 };
      const door = { id: 'door', wallId: wall.id, from: .4, to: .6 };
      const graph: DraftSnapshot['graph'] = { nodes: [
        { id: 'a', floorId: 'floor', planVersionId: 'pv', x: 0, y: 0, type: 'ACCESS' },
        { id: 'b', floorId: 'floor', planVersionId: 'pv', x: 10, y: 0, type: 'DESTINATION' },
        { id: 'c', floorId: 'floor', planVersionId: 'pv', x: 20, y: 0, type: 'DESTINATION' }
      ], connections: [
        { id: 'ab', sourceNodeId: 'a', targetNodeId: 'b', type: 'CORRIDOR', distanceMeters: 5,
          weight: 5, verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true },
        { id: 'bc', sourceNodeId: 'b', targetNodeId: 'c', type: 'CORRIDOR', distanceMeters: 5,
          weight: 5, verticalPenalty: 0, accessibility: 'UNKNOWN', bidirectional: true }
      ], destinations: [
        { id: 'pharmacy', nodeId: 'b', type: 'SERVICE', name: 'Farmacia', specialty: null },
        { id: 'cashier', nodeId: 'c', type: 'SERVICE', name: 'Caja', specialty: null }
      ], walls: [wall], doors: [door] };
      drafts.load.mockReturnValue(of(draft(0.5, graph)));
      const fixture = create([svg]);
      component.editor.select({ kind: 'node', id: 'c' });
      fixture.detectChanges();
      const remove = [...fixture.nativeElement.querySelectorAll('button')]
        .find((button: HTMLButtonElement) => button.textContent?.includes('Eliminar nodo')) as HTMLButtonElement;
      const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
      try {
        const before = component.editor.graph();
        remove.click();
        expect(confirmation).toHaveBeenCalledOnce();
        expect(confirmation.mock.calls[0][0]).toContain('Destino «Caja»');
        expect(confirmation.mock.calls[0][0]).toContain('Conexión con «Farmacia»');
        expect(component.editor.graph()).toBe(before);
        expect(component.editor.selection()).toEqual({ kind: 'node', id: 'c' });
        expect(component.editor.dirty()).toBe(false);
        expect(component.editor.canUndo()).toBe(false);
        expect(drafts.save).not.toHaveBeenCalled();

        confirmation.mockReturnValue(true);
        remove.click();
        expect(component.editor.graph()).toMatchObject({ nodes: [{ id: 'a' }, { id: 'b' }],
          connections: [{ id: 'ab' }], destinations: [{ id: 'pharmacy' }], walls: [wall], doors: [door] });
        component.undo();
        expect(component.editor.graph()).toEqual(before);
        component.redo();
        const saved = { ...draft(0.5, component.editor.graph()), etag: '"rev-2"' };
        drafts.save.mockReturnValue(of(saved));
        component.save();
        expect(drafts.save.mock.calls[0][1]).toMatchObject({ walls: [wall], doors: [door] });
        drafts.load.mockReturnValue(of(saved));
        component.reloadDraft();
        expect(component.editor.graph()).toMatchObject({ nodes: [{ id: 'a' }, { id: 'b' }],
          connections: [{ id: 'ab' }], destinations: [{ id: 'pharmacy' }], walls: [wall], doors: [door] });
      } finally {
        confirmation.mockRestore();
      }
    });

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
      drafts.save.mockReturnValue(of(draft(0.5, component.editor.graph())));
      component.save();
      expect(drafts.save.mock.calls[0][1].connections).toHaveLength(1);
      expect(drafts.save.mock.calls[0][1].walls).toHaveLength(1);
      expect(component.editor.dirty()).toBe(false);
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

    it('keeps saved destinations untouched when the selected original differs from the draft plan version', () => {
      const saved = { nodes: [{ id: 'room', floorId: 'floor', planVersionId: 'pv', x: 20, y: 20, type: 'DESTINATION' }],
        connections: [], destinations: [{ id: 'destination', nodeId: 'room', type: 'SERVICE', name: 'Caja', specialty: null }] };
      drafts.load.mockReturnValue(of(draft(0.5, saved)));
      create([svg]);
      plans.interpret.mockReturnValue(of(result({ scaleStatus: 'CONFIRMED' })));
      component.generate();
      component.applyProposal();
      expect(component.notice()).toContain('otra versión');
      expect(component.proposal()).not.toBeNull();
      expect(component.editor.graph()).toMatchObject(saved);
    });

    it('requires review before assigning one saved destination to duplicate room labels', () => {
      const saved = { nodes: [{ id: 'room', floorId: 'floor', planVersionId: 'pv', x: 20, y: 20, type: 'DESTINATION' }],
        connections: [], destinations: [{ id: 'destination', nodeId: 'room', type: 'SERVICE', name: 'Caja', specialty: null }] };
      drafts.load.mockReturnValue(of(draft(0.5, saved)));
      create([{ ...svg, id: 'pv' }]);
      const zones = [
        { id: 'r1', name: 'Caja', category: 'ROOM', x: 0, y: 0, width: 20, height: 20 },
        { id: 'r2', name: 'Caja', category: 'ROOM', x: 30, y: 0, width: 20, height: 20 }
      ];
      plans.interpret.mockReturnValue(of(result({ versionId: 'pv', scaleStatus: 'CONFIRMED', proposal: {
        zones, nodes: [{ id: 'r1', role: 'ROOM', label: 'Caja', x: 10, y: 10 },
          { id: 'r2', role: 'ROOM', label: 'Caja', x: 40, y: 10 }],
        connections: [], wallCandidates: [], warnings: []
      } })));
      component.generate();
      component.applyProposal();
      expect(component.notice()).toContain('nombres repetidos');
      expect(component.proposal()).not.toBeNull();
      expect(component.editor.graph()).toMatchObject(saved);
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
      expect(component.alerts().some(message => message.includes('«ROOM 2» no tiene una etiqueta confiable'))).toBe(false);
      expect(component.tab()).toBe('alerts');
    });

    it('flags every zone when the SVG has no text at all', () => {
      create([svg]);
      const zones = ['ROOM 1', 'ROOM 2', 'CORRIDOR 3'].map((name, index) => ({ id: `z${index}`, name, category: 'ROOM', x: index * 10, y: 0, width: 10, height: 10 }));
      plans.interpret.mockReturnValue(of(result({ proposal: { ...proposal, zones, warnings: [] } })));
      component.generate();
      expect(component.unlabeled()).toHaveLength(3);
      expect(component.alerts().filter(message => message.includes('no tiene una etiqueta confiable'))).toHaveLength(0);
    });
  });

  it('shows the recognized piso2 plan as a clean, applicable proposal', () => {
    create([svg]);
    plans.interpret.mockReturnValue(of(result({ proposal: piso2Proposal as ModelProposal })));
    component.generate();
    expect(component.summary()).toMatchObject({ nodes: 32, connections: 33, doors: 10 });
    expect(component.alerts()).toEqual([]);
    expect(component.previewValidationErrors()).toEqual([]);
    expect(component.tab()).toBe('properties');
    expect(component.canApply()).toBe(true);
  });

  describe('classification and network', () => {
    const rooms = [
      { id: 'zone-0', name: 'Consultorio 101', category: 'ROOM', x: 0, y: 0, width: 10, height: 10 },
      { id: 'zone-1', name: 'ROOM 2', category: 'ROOM', x: 20, y: 0, width: 10, height: 10 },
      { id: 'zone-2', name: 'Pasillo A', category: 'CORRIDOR', x: 0, y: 20, width: 30, height: 5 }
    ];
    const richProposal = (): ModelProposal => ({
      ...proposal, zones: rooms, warnings: [],
      nodes: rooms.map(zone => ({ id: zone.id, label: zone.name,
        role: zone.id === 'zone-2' ? 'ACCESS' : 'DESTINATION',
        x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 })),
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
      component.previewEditor.setTool('edge');
      component.previewEditor.nodeClick('zone-2');
      component.previewEditor.nodeClick('zone-1');
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

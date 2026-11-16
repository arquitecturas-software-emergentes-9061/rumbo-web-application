import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { DraftSnapshot } from '../../../application/draft-graph.contracts';
import { DRAFT_GRAPH_PORT, SITES_PORT } from '../../../application/planning.ports';
import { InterfloorConnectionsComponent } from './interfloor-connections.component';

describe('InterfloorConnectionsComponent', () => {
  const site = { id: 'site', name: 'Sede Central', address: null, clinicId: 'clinic' };
  const floors = [
    { id: 'floor-a', siteId: 'site', number: 1, name: 'Piso 1', description: null },
    { id: 'floor-b', siteId: 'site', number: 2, name: 'Piso 2', description: null },
  ];
  const graph: DraftSnapshot['graph'] = {
    siteId: 'site', mapId: 'map', modelVersionId: 'draft', status: 'DRAFT',
    nodes: [
      { id: 'a', floorId: 'floor-a', planVersionId: 'plan-a', x: 1, y: 1, type: 'VERTICAL_LINK' },
      { id: 'b', floorId: 'floor-b', planVersionId: 'plan-b', x: 2, y: 2, type: 'VERTICAL_LINK' },
    ],
    connections: [], destinations: [], walls: [], doors: [],
  };
  const snapshot: DraftSnapshot = { graph, etag: '"rev-1"' };
  const sites = { loadSites: vi.fn(() => of([site])), loadFloors: vi.fn(() => of(floors)) };
  const drafts = { load: vi.fn(() => of(snapshot)), save: vi.fn() };

  async function open() {
    const fixture = TestBed.createComponent(InterfloorConnectionsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    drafts.load.mockReturnValue(of(snapshot));
    TestBed.configureTestingModule({ imports: [InterfloorConnectionsComponent],
      providers: [provideRouter([]), { provide: SITES_PORT, useValue: sites },
        { provide: DRAFT_GRAPH_PORT, useValue: drafts }, { provide: AUTH_PORT, useValue: {} }] });
  });

  it('shows vertical links with mobility class, direction and cost after loading', async () => {
    const link = { id: 'v', sourceNodeId: 'a', targetNodeId: 'b', type: 'RAMP',
      accessibility: 'INACCESSIBLE' as const, distanceMeters: 5, weight: 7, verticalPenalty: 3, bidirectional: false };
    drafts.load.mockReturnValue(of({ graph: { ...graph, connections: [link] }, etag: '"rev-2"' }));
    const { fixture } = await open();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Rampa');
    expect(content).toContain('No accesible');
    expect(content).toContain('Un sentido');
    expect(content).toContain('Base 7 + vertical 3');
    expect(fixture.nativeElement.querySelector('svg g.inaccessible')).not.toBeNull();
  });

  it('recovers an unrelated 412 without losing entered data or overwriting the newer draft', async () => {
    const { component } = await open();
    component.fromFloor.set('floor-a'); component.toFloor.set('floor-b');
    component.from.set('a'); component.to.set('b'); component.distance.set(5);
    component.weight.set(7); component.penalty.set(3); component.accessibility.set('ACCESSIBLE');
    const latest = { graph: { ...graph, destinations: [
      { id: 'new', nodeId: 'b', name: 'Ascensor', type: 'SERVICE', specialty: null }] }, etag: '"rev-2"' };
    drafts.save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 412 })))
      .mockReturnValueOnce(of({ graph: { ...latest.graph, connections: [] }, etag: '"rev-3"' }));
    drafts.load.mockReturnValueOnce(of(latest));
    await component.save();
    expect(component.snapshot()).toEqual(latest);
    expect(component.stale()).toBe(false);
    expect(component.distance()).toBe(5);
    expect(component.formError()).toContain('se conservaron tus datos');
    expect(drafts.save).toHaveBeenCalledTimes(1);
    await component.save();
    expect(drafts.save).toHaveBeenLastCalledWith(latest, expect.objectContaining({
      type: 'ELEVATOR', accessibility: 'ACCESSIBLE', verticalPenalty: 3 }));
  });

  it('blocks retry when another editor changed the same connection', async () => {
    const original = { id: 'v', sourceNodeId: 'a', targetNodeId: 'b', type: 'STAIRS',
      accessibility: 'UNKNOWN' as const, distanceMeters: 4, weight: 4, verticalPenalty: 0, bidirectional: true };
    drafts.load.mockReturnValueOnce(of({ graph: { ...graph, connections: [original] }, etag: '"rev-1"' }));
    const { component, fixture } = await open();
    const dialog = fixture.nativeElement.querySelector('dialog');
    dialog.showModal = vi.fn(); dialog.close = vi.fn();
    component.open(dialog, original);
    const changed = { ...original, accessibility: 'INACCESSIBLE' as const };
    drafts.load.mockReturnValueOnce(of({ graph: { ...graph, connections: [changed] }, etag: '"rev-2"' }));
    drafts.save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 412 })));
    await component.save();
    expect(component.stale()).toBe(true);
    expect(component.formError()).toContain('Otra persona modificó');
    await component.save();
    expect(drafts.save).toHaveBeenCalledTimes(1);
  });
});

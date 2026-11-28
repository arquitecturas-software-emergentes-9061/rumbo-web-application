import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { ANALYTICS_PORT } from '../../../application/analytics.ports';
import { NavigationHeatmap, SiteModel } from '../../../domain/model/heatmap.model';
import { DisorientationHeatmapComponent } from './disorientation-heatmap.component';

describe('DisorientationHeatmapComponent', () => {
  const model: SiteModel = {
    siteId: 's1',
    plans: [{ floorId: 'f1', widthUnits: 100, heightUnits: 60 }, { floorId: 'f2', widthUnits: 100, heightUnits: 60 }],
    floors: [{ id: 'f2', number: 2, name: 'Piso 2' }, { id: 'f1', number: 1, name: 'Piso 1' }],
    nodes: [
      { id: 'n1', floorId: 'f1', x: 10, y: 10, type: 'ACCESS' },
      { id: 'n2', floorId: 'f2', x: 50, y: 30, type: 'DESTINATION' },
      { id: 'n3', floorId: 'f2', x: 80, y: 40, type: 'INTERSECTION' }
    ],
    destinations: [{ id: 'd', nodeId: 'n2', floorId: 'f2', name: 'Radiología' }],
    walls: [], doors: []
  };
  const heatmap: NavigationHeatmap = {
    cells: [
      { floorId: 'f1', nodeReference: 'n1', deviations: 2, recalculations: 0 },
      { floorId: 'f2', nodeReference: 'n2', deviations: 18, recalculations: 4 },
      { floorId: 'f2', nodeReference: 'n3', deviations: 3, recalculations: 1 }
    ],
    discardedEvents: 2
  };
  const port = { listSites: vi.fn(), loadModel: vi.fn(), loadHeatmap: vi.fn() };
  let component: DisorientationHeatmapComponent;

  const create = () => {
    TestBed.configureTestingModule({
      imports: [DisorientationHeatmapComponent],
      providers: [provideRouter([]), { provide: ANALYTICS_PORT, useValue: port }, { provide: AUTH_PORT, useValue: {} }]
    });
    const fixture = TestBed.createComponent(DisorientationHeatmapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    port.listSites.mockReturnValue(of([{ id: 's1', name: 'Sede Central' }, { id: 's2', name: 'Sede Norte' }]));
    port.loadModel.mockReturnValue(of(model));
    port.loadHeatmap.mockReturnValue(of(heatmap));
  });

  it('loads the first site with a 30-day period and opens the floor with most incidents', () => {
    create();
    expect(port.loadModel).toHaveBeenCalledWith('s1');
    const [siteId, from, to] = port.loadHeatmap.mock.calls[0];
    expect(siteId).toBe('s1');
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(30);
    expect(component.floors().map(floor => floor.name)).toEqual(['Piso 1', 'Piso 2']);
    expect(component.floorId()).toBe('f2');
  });

  it('draws the cells of the floor and lists the problematic zones', () => {
    create();
    expect(component.cells().map(cell => [cell.nodeReference, cell.level])).toEqual([['n2', 'high'], ['n3', 'low']]);
    expect(component.problems()[0]).toMatchObject({ label: 'Radiología', incidents: 22, recalculationShare: 80 });
    component.selectFloor('f1');
    expect(component.problems().map(spot => spot.nodeReference)).toEqual(['n1']);
  });

  it('highlights a zone on the map and toggles it off', () => {
    create();
    component.show('n2');
    expect(component.highlighted()).toBe('n2');
    component.show('n2');
    expect(component.highlighted()).toBeNull();
  });

  it('keeps the zoom between 1x and 3x and resets it', () => {
    create();
    for (let i = 0; i < 12; i++) component.zoomBy(0.25);
    expect(component.zoom()).toBe(3);
    component.zoomBy(-5);
    expect(component.zoom()).toBe(1);
    component.zoomBy(0.5);
    component.resetView();
    expect(component.zoom()).toBe(1);
  });

  it('rejects an invalid period without calling the API', () => {
    create();
    port.loadHeatmap.mockClear();
    component.setFrom('2026-09-30');
    component.setTo('2026-09-01');
    component.apply();
    expect(component.periodError()).toContain('posterior');
    expect(port.loadHeatmap).not.toHaveBeenCalled();
  });

  it('applies a valid period reusing the loaded model', () => {
    create();
    port.loadModel.mockClear();
    component.setFrom('2026-09-01');
    component.setTo('2026-09-30');
    component.apply();
    expect(port.loadModel).not.toHaveBeenCalled();
    expect(port.loadHeatmap).toHaveBeenLastCalledWith('s1', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  });

  it('reloads model and heatmap when the site changes', () => {
    create();
    component.selectSite('s2');
    expect(port.loadModel).toHaveBeenLastCalledWith('s2');
    expect(port.loadHeatmap.mock.lastCall?.[0]).toBe('s2');
  });

  it('explains a site without published map', () => {
    port.loadModel.mockReturnValue(of(null));
    create();
    expect(component.noMap()).toBe(true);
    expect(component.cells()).toEqual([]);
  });

  it('reports an empty period without inventing zones', () => {
    port.loadHeatmap.mockReturnValue(of({ cells: [], discardedEvents: 0 }));
    create();
    expect(component.hasData()).toBe(false);
    expect(component.floorHasData()).toBe(false);
    expect(component.problems()).toEqual([]);
  });

  it('shows an unavailable-metrics message on a 503', () => {
    port.loadHeatmap.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    create();
    expect(component.error()).toContain('no están disponibles');
    expect(component.loading()).toBe(false);
  });

  it('shows the empty state when the account has no published site', () => {
    port.listSites.mockReturnValue(of([]));
    create();
    expect(component.sites()).toEqual([]);
    expect(component.loading()).toBe(false);
    expect(port.loadModel).not.toHaveBeenCalled();
  });
});

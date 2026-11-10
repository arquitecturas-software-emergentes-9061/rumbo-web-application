import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Beacon } from '../../../domain/model/beacon.model';
import { AUTH_PORT } from '../../../../iam/application/iam.ports';
import { BEACONS_PORT } from '../../../application/planning.ports';
import { SITES_PORT } from '../../../application/planning.ports';
import { BeaconsManagementComponent } from './beacons-management.component';

describe('BeaconsManagementComponent', () => {
  const site = { id: 'site', name: 'Sede Central', address: null, clinicId: 'clinic' };
  const floor1 = { id: 'floor-1', siteId: 'site', number: 1, name: 'Piso 1', description: null };
  const floor2 = { id: 'floor-2', siteId: 'site', number: 2, name: 'Piso 2', description: null };
  const beacon = (overrides: Partial<Beacon>): Beacon => ({
    id: 'b1', siteId: 'site', floorId: 'floor-2', identifier: 'ac:23:3f:8a:11:c4', name: 'B-01',
    proximityUuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', major: 100, minor: 1, txPowerDbm: -59,
    x: 10, y: 5, active: true, ...overrides
  });
  const placed = beacon({});
  const unplaced = beacon({ id: 'b5', name: 'B-05', minor: 5, x: null, y: null, active: false });

  const sites = { loadSites: () => of([site]), loadFloors: vi.fn() };
  const api = { load: vi.fn(), loadPlanBounds: vi.fn(), register: vi.fn(), update: vi.fn(), setActive: vi.fn() };
  let component: BeaconsManagementComponent;

  const validForm = {
    name: 'B-06', identifier: 'AC:23:3F:8A:11:C5', proximityUuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e',
    major: 100, minor: 6, txPowerDbm: -59, floorId: 'floor-2', active: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sites.loadFloors.mockReturnValue(of([floor2, floor1]));
    api.load.mockReturnValue(of([placed, unplaced]));
    api.loadPlanBounds.mockReturnValue(of([{ floorId: 'floor-2', widthUnits: 100, heightUnits: 60 }]));
    TestBed.configureTestingModule({
      imports: [BeaconsManagementComponent],
      providers: [provideRouter([]), { provide: SITES_PORT, useValue: sites },
        { provide: BEACONS_PORT, useValue: api }, { provide: AUTH_PORT, useValue: {} }]
    });
    const fixture = TestBed.createComponent(BeaconsManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the site inventory and separates placed from unplaced beacons on the first floor', () => {
    expect(component.floors().map(floor => floor.name)).toEqual(['Piso 1', 'Piso 2']);
    expect(component.beacons()).toHaveLength(2);
    component.setFloorFilter('floor-2');
    expect(component.panelPlaced().map(item => item.name)).toEqual(['B-01']);
    expect(component.panelUnplaced().map(item => item.name)).toEqual(['B-05']);
    expect(component.rangeLabel()).toBe('Mostrando 1–2 de 2 balizas');
  });

  it('filters by text and status and resets to the first page', () => {
    component.setQuery('b-05');
    expect(component.filtered().map(item => item.id)).toEqual(['b5']);
    component.setQuery('');
    component.setStatusFilter('inactive');
    expect(component.filtered().map(item => item.id)).toEqual(['b5']);
  });

  it('registers a beacon without position as unplaced and never requests activation', () => {
    api.register.mockReturnValue(of(beacon({ id: 'b6', name: 'B-06', minor: 6, x: null, y: null, active: false })));
    component.openCreate();
    component.form.setValue(validForm);
    expect(component.canActivate()).toBe(false);
    component.save();
    expect(api.register).toHaveBeenCalledWith('site', expect.objectContaining({
      identifier: 'ac:23:3f:8a:11:c5', x: null, y: null, floorId: 'floor-2'
    }));
    expect(api.setActive).not.toHaveBeenCalled();
    expect(component.success()).toBe('Baliza registrada.');
    expect(component.drawer()).toBeNull();
  });

  it('activates after saving when the beacon is placed and the toggle is on', () => {
    api.register.mockReturnValue(of(beacon({ id: 'b6', active: false })));
    api.setActive.mockReturnValue(of(beacon({ id: 'b6', active: true })));
    component.openCreate();
    component.form.setValue({ ...validForm, active: true });
    component.setCoordinate('x', '42.8');
    component.setCoordinate('y', '18.2');
    expect(component.position()).toEqual({ x: 42.8, y: 18.2 });
    component.save();
    expect(api.register).toHaveBeenCalledWith('site', expect.objectContaining({ x: 42.8, y: 18.2 }));
    expect(api.setActive).toHaveBeenCalledWith('site', 'b6', true);
    expect(component.beacons().find(item => item.id === 'b6')?.active).toBe(true);
  });

  it('clamps coordinates to the plan and discards the position when the floor changes', () => {
    component.openCreate();
    component.form.controls.floorId.setValue('floor-2');
    component.setCoordinate('x', '250');
    component.setCoordinate('y', '-4');
    expect(component.position()).toEqual({ x: 100, y: 0 });
    component.form.controls.active.setValue(true);
    component.onFloorChange();
    expect(component.position()).toBeNull();
    expect(component.form.controls.active.value).toBe(false);
  });

  it('keeps the form open and flags a duplicate identifier from the server', () => {
    api.register.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'BEACON_IDENTIFIER_EXISTS' } })));
    component.openCreate();
    component.form.setValue(validForm);
    component.save();
    expect(component.duplicate()).toBe(true);
    expect(component.drawer()).not.toBeNull();
    expect(component.formError()).toContain('ya está registrada');
  });

  it('does not submit an invalid form', () => {
    component.openCreate();
    component.form.patchValue({ ...validForm, identifier: 'not-a-mac', major: 70000 });
    component.save();
    expect(api.register).not.toHaveBeenCalled();
    expect(component.form.controls.identifier.touched).toBe(true);
  });

  it('toggles activation through the status endpoint', () => {
    api.setActive.mockReturnValue(of({ ...placed, active: false }));
    component.toggleActive(placed);
    expect(api.setActive).toHaveBeenCalledWith('site', 'b1', false);
    expect(component.beacons().find(item => item.id === 'b1')?.active).toBe(false);
  });

  it('accepts legacy identifiers when editing an existing beacon', () => {
    const legacy = beacon({ id: 'old', identifier: 'aaaa1234', name: null });
    component.openEdit(legacy);
    expect(component.form.controls.identifier.valid).toBe(true);
    expect(component.displayName(legacy)).toBe('aaaa1234');
  });
});

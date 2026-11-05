import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { SitesService } from '../../../../core/services/sites.service';
import { Floor } from '../../../../core/models/site-floor.model';
import { SitesManagementComponent } from './sites-management.component';

describe('SitesManagementComponent', () => {
  const first = { id: 'first', name: 'Sede Central', address: 'Av. Central', clinicId: 'clinic' };
  const second = { ...first, id: 'second', name: 'Sede Norte' };
  const floor = { id: 'server-floor', siteId: first.id, number: -1, name: 'Sótano', description: null };
  const service = {
    getOrganization: () => of({ id: 'clinic', name: 'Clínica', code: 'CL', contactEmail: 'c@example.test', phone: null }),
    loadSites: () => of([first, second]),
    loadFloors: vi.fn(),
    createFloor: vi.fn(),
    createSite: vi.fn(),
  };
  let component: SitesManagementComponent;
  beforeEach(() => {
    vi.clearAllMocks();
    service.loadFloors.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [SitesManagementComponent],
      providers: [provideRouter([]), { provide: SitesService, useValue: service }, { provide: AuthService, useValue: {} }]
    });
    const fixture = TestBed.createComponent(SitesManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows success and the server floor only after a confirmed response', () => {
    const response = new Subject<Floor>();
    service.createFloor.mockReturnValue(response);
    component.openFloor();
    component.floorForm.setValue({ number: -1, name: 'Sótano', description: '' });
    component.saveFloor();
    expect(component.success()).toBeNull();
    expect(component.floors()).toEqual([]);
    response.next(floor);
    response.complete();
    expect(component.success()).toBe('Piso registrado.');
    expect(component.floors()).toEqual([floor]);
  });

  it('shows the conflict and retains form input until explicit acknowledgement', () => {
    service.createSite.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 409, error: { code: 'SITE_ADDRESS_EXISTS' }
    }))).mockReturnValueOnce(of({ ...second, id: 'new' }));
    component.openSite();
    component.siteForm.setValue({ name: second.name, address: first.address });
    component.saveSite();
    expect(component.success()).toBeNull();
    expect(component.duplicateAddress()).toBe(true);
    expect(component.siteForm.value.address).toBe(first.address);
    component.saveSite(true);
    expect(service.createSite).toHaveBeenLastCalledWith({ name: second.name, address: first.address, allowDuplicateAddress: true });
    expect(component.success()).toBe('Sede registrada.');
  });

  it('does not show a late response from a previously selected site', () => {
    const previous = new Subject<Floor[]>();
    service.loadFloors.mockReturnValueOnce(previous).mockReturnValueOnce(of([]));
    component.selectSite(first.id);
    component.selectSite(second.id);
    previous.next([floor]);
    expect(component.selectedSite()?.id).toBe(second.id);
    expect(component.floors()).toEqual([]);
  });
});

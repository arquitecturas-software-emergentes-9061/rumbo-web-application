import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MapSectionNavigationComponent } from './map-section-navigation.component';

describe('MapSectionNavigationComponent', () => {
  it('shows the same location and tabs with the current section highlighted', () => {
    TestBed.configureTestingModule({ imports: [MapSectionNavigationComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MapSectionNavigationComponent);
    fixture.componentRef.setInput('active', 'connections');
    fixture.componentRef.setInput('siteId', 'site-1');
    fixture.componentRef.setInput('siteName', 'Sede Central');
    fixture.componentRef.setInput('floorId', 'floor-2');
    fixture.componentRef.setInput('floors', [{ id: 'floor-2', siteId: 'site-1', name: 'Piso 2', number: 2, description: null }]);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.location-path')?.textContent).toContain('Mapas');
    expect(host.querySelector('.location-path')?.textContent).toContain('Sede Central');
    expect(host.querySelector('.location-path')?.textContent).toContain('Piso 2');
    expect(host.querySelector('.map-workflow-tabs [aria-current="page"]')?.textContent).toBe('Conexiones entre pisos');
    expect(host.querySelectorAll('.map-workflow-tabs a')).toHaveLength(4);
    expect(host.querySelector('a[href*="#publication"]')?.textContent).toContain('Validar y publicar');
    expect(host.querySelector('a[href*="/planning/map-editor"]')?.getAttribute('href')).toContain('floorId=floor-2');
  });

  it('emits a floor selection from the shared header', () => {
    TestBed.configureTestingModule({ imports: [MapSectionNavigationComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MapSectionNavigationComponent);
    fixture.componentRef.setInput('active', 'plan');
    fixture.componentRef.setInput('floors', [{ id: 'floor-2', siteId: 'site-1', name: 'Piso 2', number: 2, description: null }]);
    const selected = vi.fn();
    fixture.componentInstance.floorSelected.subscribe(selected);
    fixture.detectChanges();

    const picker: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    picker.value = 'floor-2';
    picker.dispatchEvent(new Event('change'));
    expect(selected).toHaveBeenCalledWith('floor-2');
  });
});

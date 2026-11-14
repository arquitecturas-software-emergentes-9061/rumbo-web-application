import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, finalize, firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { Beacon, FloorPlanBounds } from '../../../domain/model/beacon.model';
import { Floor, Site } from '../../../domain/model/site-floor.model';
import { BEACONS_PORT, FLOOR_PLANS_PORT } from '../../../application/planning.ports';
import { SITES_PORT } from '../../../application/planning.ports';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';
import { BeaconPosition, MAC_PATTERN, UUID_PATTERN, clampToPlan, hasValidPlacement, isInsidePlan } from '../../../domain/model/beacon-rules';
import { approximateRangeMeters, toSaveRequest } from '../../../application/beacon-form';
import { renderPdfPreview } from '../floor-plan-calibration/plan-preview';

const PAGE_SIZE = 6;
const LEGACY_IDENTIFIER = /^[a-z0-9:_-]{4,100}$/i;
const integer: ValidatorFn = control => Number.isInteger(control.value) ? null : { integer: true };
const trimmed: ValidatorFn = control =>
  typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };


@Component({
  selector: 'app-beacons-management',
  imports: [ReactiveFormsModule, RouterLink, AdminShellComponent],
  templateUrl: './beacons-management.component.html',
  styleUrl: './beacons-management.component.css'
})
export class BeaconsManagementComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly beaconsApi = inject(BEACONS_PORT);
  private readonly floorPlansApi = inject(FLOOR_PLANS_PORT);
  private readonly sitesApi = inject(SITES_PORT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly siteSelection = new Subject<string | null>();

  readonly sites = signal<Site[]>([]);
  readonly siteId = signal<string | null>(null);
  readonly site = computed(() => this.sites().find(item => item.id === this.siteId()) ?? null);
  readonly floors = signal<Floor[]>([]);
  readonly beacons = signal<Beacon[]>([]);
  readonly plans = signal<FloorPlanBounds[]>([]);
  readonly planImages = signal<Record<string, string>>({});
  private imageRevision = 0;
  private readonly loadingImages = new Set<string>();
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly query = signal('');
  readonly floorFilter = signal('all');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly page = signal(0);

  readonly drawer = signal<{ beaconId: string | null } | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly duplicate = signal(false);
  readonly position = signal<BeaconPosition | null>(null);
  readonly picking = signal(false);
  readonly busyBeaconId = signal<string | null>(null);

  readonly form = this.fb.group({
    name: ['', [trimmed, Validators.maxLength(100)]],
    identifier: ['', [Validators.required, Validators.pattern(MAC_PATTERN)]],
    proximityUuid: ['', [Validators.required, Validators.pattern(UUID_PATTERN)]],
    major: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(65535), integer]),
    minor: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(65535), integer]),
    txPowerDbm: this.fb.control<number | null>(-59, [Validators.required, Validators.min(-120), Validators.max(0), integer]),
    floorId: ['', Validators.required],
    active: [false]
  });

  readonly filtered = computed(() => {
    const text = this.query().trim().toLowerCase();
    const floor = this.floorFilter();
    const status = this.statusFilter();
    return this.beacons().filter(beacon =>
      (floor === 'all' || beacon.floorId === floor)
      && (status === 'all' || beacon.active === (status === 'active'))
      && (!text || [beacon.name, beacon.identifier, beacon.proximityUuid, beacon.major, beacon.minor]
        .some(field => field !== null && String(field).toLowerCase().includes(text))));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = Math.min(this.page(), this.pageCount() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (total === 0) return 'Sin balizas para mostrar';
    const start = Math.min(this.page(), this.pageCount() - 1) * PAGE_SIZE;
    return `Mostrando ${start + 1}–${start + this.visible().length} de ${total} ${total === 1 ? 'baliza' : 'balizas'}`;
  });

  readonly panelFloor = computed(() => {
    const floors = this.floors();
    return floors.find(floor => floor.id === this.floorFilter()) ?? floors[0] ?? null;
  });
  readonly panelBeacons = computed(() => this.beacons().filter(beacon => beacon.floorId === this.panelFloor()?.id));
  readonly panelPlaced = computed(() => this.panelBeacons().filter(beacon => this.placed(beacon)));
  readonly panelUnplaced = computed(() => this.panelBeacons().filter(beacon => !this.placed(beacon)));
  readonly panelBounds = computed(() => this.boundsFor(this.panelFloor()?.id ?? null));
  readonly formBounds = computed(() => this.boundsFor(this.form.controls.floorId.value || null));
  readonly canActivate = computed(() => isInsidePlan(this.position(), this.formBounds()));

  ngOnDestroy(): void { this.clearPlanImages(); }

  ngOnInit(): void {
    this.siteSelection.pipe(
      switchMap(id => {
        this.beacons.set([]);
        this.floors.set([]);
        this.plans.set([]);
        this.clearPlanImages();
        if (!id) return of(null);
        this.loading.set(true);
        return forkJoin({
          floors: this.sitesApi.loadFloors(id),
          beacons: this.beaconsApi.load(id),
          plans: this.beaconsApi.loadPlanBounds(id)
        }).pipe(
          catchError((error: HttpErrorResponse) => {
            this.loadFailed.set(true);
            this.error.set(this.message(error, 'No se pudo cargar el inventario de balizas.'));
            return of(null);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(result => {
      this.loading.set(false);
      if (!result) return;
      this.floors.set([...result.floors].sort((a, b) => a.number - b.number));
      this.beacons.set(result.beacons);
      this.plans.set(result.plans);
      this.ensurePlanImage(this.panelFloor()?.id ?? null);
    });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    this.sitesApi.loadSites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: sites => {
        this.sites.set(sites);
        const current = sites.find(item => item.id === this.siteId());
        this.selectSite(current?.id ?? sites[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadFailed.set(true);
        this.error.set(this.message(error, 'No se pudieron cargar las sedes.'));
      }
    });
  }

  selectSite(id: string | null): void {
    this.siteId.set(id);
    this.floorFilter.set('all');
    this.page.set(0);
    this.closeDrawer(true);
    this.loadFailed.set(false);
    this.error.set(null);
    this.loading.set(id !== null);
    this.siteSelection.next(id);
  }

  setQuery(value: string): void { this.query.set(value); this.page.set(0); }
  setFloorFilter(value: string): void {
    this.floorFilter.set(value); this.page.set(0);
    this.ensurePlanImage(this.panelFloor()?.id ?? null);
  }
  setStatusFilter(value: string): void {
    this.statusFilter.set(value === 'active' || value === 'inactive' ? value : 'all');
    this.page.set(0);
  }
  goToPage(page: number): void { this.page.set(Math.min(Math.max(page, 0), this.pageCount() - 1)); }

  floorName(floorId: string): string {
    return this.floors().find(floor => floor.id === floorId)?.name ?? 'Piso desconocido';
  }

  displayName(beacon: Beacon): string { return beacon.name ?? beacon.identifier; }
  range(beacon: Beacon): number | null { return approximateRangeMeters(beacon.txPowerDbm); }
  placed(beacon: Beacon): boolean { return hasValidPlacement(beacon, this.boundsFor(beacon.floorId)); }
  formRange(): number | null { return approximateRangeMeters(this.form.controls.txPowerDbm.value); }

  openCreate(): void {
    this.begin(null);
    this.form.controls.identifier.setValidators([Validators.required, Validators.pattern(MAC_PATTERN)]);
    this.form.reset({
      name: '', identifier: '', proximityUuid: '', major: null, minor: null, txPowerDbm: -59,
      floorId: this.panelFloor()?.id ?? '', active: false
    });
    this.position.set(null);
    this.ensurePlanImage(this.form.controls.floorId.value);
  }

  openEdit(beacon: Beacon): void {
    this.begin(beacon.id);
    this.form.controls.identifier.setValidators([Validators.required, Validators.pattern(LEGACY_IDENTIFIER)]);
    this.form.reset({
      name: beacon.name ?? '', identifier: beacon.identifier, proximityUuid: beacon.proximityUuid ?? '',
      major: beacon.major, minor: beacon.minor, txPowerDbm: beacon.txPowerDbm ?? -59,
      floorId: beacon.floorId, active: beacon.active
    });
    this.position.set(this.placed(beacon) ? { x: beacon.x as number, y: beacon.y as number } : null);
    this.ensurePlanImage(beacon.floorId);
  }

  closeDrawer(force = false): void {
    if (this.saving() && !force) return;
    this.drawer.set(null);
    this.picking.set(false);
    this.formError.set(null);
    this.duplicate.set(false);
  }

  togglePicking(): void { this.picking.update(value => !value); }

  placeOnPlan(event: MouseEvent): void {
    const bounds = this.formBounds();
    const surface = event.currentTarget as HTMLElement;
    if (!bounds) return;
    const box = surface.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.setPosition(
      ((event.clientX - box.left) / box.width) * bounds.widthUnits,
      ((event.clientY - box.top) / box.height) * bounds.heightUnits
    );
  }

  setCoordinate(axis: 'x' | 'y', raw: string): void {
    const value = raw.trim() === '' ? NaN : Number(raw);
    const current = this.position();
    if (!Number.isFinite(value)) return;
    const next = { x: current?.x ?? 0, y: current?.y ?? 0, [axis]: value };
    this.setPosition(next.x, next.y);
  }

  clearPosition(): void {
    this.position.set(null);
    this.form.controls.active.setValue(false);
  }

  onFloorChange(): void {
    // A position belongs to one floor plan, so changing floor discards it.
    this.clearPosition();
    this.ensurePlanImage(this.form.controls.floorId.value);
  }

  private async ensurePlanImage(floorId: string | null): Promise<void> {
    const siteId = this.siteId();
    const versionId = this.boundsFor(floorId)?.planVersionId;
    if (!siteId || !floorId || !versionId || this.planImages()[floorId] || this.loadingImages.has(floorId)) return;
    this.loadingImages.add(floorId);
    const revision = this.imageRevision;
    try {
      const response = await firstValueFrom(this.floorPlansApi.original(siteId, floorId, versionId));
      if (!response.body || revision !== this.imageRevision) return;
      const image = (response.body.type === 'application/pdf'
        || response.headers.get('Content-Type')?.startsWith('application/pdf'))
        ? await renderPdfPreview(response.body) : response.body;
      if (revision !== this.imageRevision) return;
      this.planImages.update(images => ({ ...images, [floorId]: URL.createObjectURL(image) }));
    } catch {
      // The positions remain available when the original plan cannot be displayed.
    } finally {
      if (revision === this.imageRevision) this.loadingImages.delete(floorId);
    }
  }

  private clearPlanImages(): void {
    this.imageRevision++;
    for (const url of Object.values(this.planImages())) URL.revokeObjectURL(url);
    this.planImages.set({});
    this.loadingImages.clear();
  }

  save(): void {
    if (this.saving()) return;
    if (this.form.invalid) return this.form.markAllAsTouched();
    const siteId = this.siteId();
    if (!siteId) return;
    const value = this.form.getRawValue();
    const request = toSaveRequest(value, this.position());
    const beaconId = this.drawer()?.beaconId ?? null;
    const wantsActive = value.active && request.x !== null;
    this.saving.set(true);
    this.formError.set(null);
    this.duplicate.set(false);
    const saved: Observable<Beacon> = beaconId
      ? this.beaconsApi.update(siteId, beaconId, request)
      : this.beaconsApi.register(siteId, request);
    saved.pipe(
      switchMap(beacon => beacon.active === wantsActive ? of(beacon) : this.beaconsApi.setActive(siteId, beacon.id, wantsActive)),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: beacon => {
        this.beacons.update(list => [...list.filter(item => item.id !== beacon.id), beacon]
          .sort((a, b) => this.displayName(a).localeCompare(this.displayName(b), 'es', { numeric: true })));
        this.closeDrawer(true);
        this.success.set(beaconId ? 'Baliza actualizada.' : 'Baliza registrada.');
      },
      error: (error: HttpErrorResponse) => {
        this.duplicate.set(error.error?.code === 'BEACON_IDENTIFIER_EXISTS');
        this.formError.set(this.message(error, 'El servidor no confirmó el guardado.'));
      }
    });
  }

  toggleActive(beacon: Beacon): void {
    const siteId = this.siteId();
    if (!siteId || this.busyBeaconId()) return;
    if (!beacon.active && !this.placed(beacon)) {
      this.error.set('Ubica esta baliza dentro del plano antes de activarla.');
      return;
    }
    this.success.set(null);
    this.error.set(null);
    this.busyBeaconId.set(beacon.id);
    this.beaconsApi.setActive(siteId, beacon.id, !beacon.active).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.busyBeaconId.set(null))
    ).subscribe({
      next: updated => {
        this.beacons.update(list => list.map(item => item.id === updated.id ? updated : item));
        this.success.set(updated.active ? 'Baliza activada para la navegación.' : 'Baliza desactivada.');
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error, 'No se pudo cambiar el estado de la baliza.'))
    });
  }

  dotLeft(beacon: Beacon): number {
    const bounds = this.panelBounds();
    return bounds && beacon.x !== null ? (beacon.x / bounds.widthUnits) * 100 : 0;
  }

  dotTop(beacon: Beacon): number {
    const bounds = this.panelBounds();
    return bounds && beacon.y !== null ? (beacon.y / bounds.heightUnits) * 100 : 0;
  }

  private begin(beaconId: string | null): void {
    this.success.set(null);
    this.formError.set(null);
    this.duplicate.set(false);
    this.picking.set(false);
    this.drawer.set({ beaconId });
  }

  private setPosition(x: number, y: number): void {
    const bounds = this.formBounds();
    if (!bounds) return;
    this.position.set(clampToPlan(x, y, bounds.widthUnits, bounds.heightUnits));
  }

  private boundsFor(floorId: string | null): FloorPlanBounds | null {
    return floorId ? this.plans().find(plan => plan.floorId === floorId) ?? null : null;
  }

  private message(error: HttpErrorResponse, fallback: string): string {
    const code = error.error?.code;
    if (code === 'BEACON_IDENTIFIER_EXISTS') return 'Esta combinación de identificador, UUID, Major y Minor ya está registrada en otra baliza de la sede.';
    if (code === 'INVALID_SPATIAL_ANCHOR') return 'La posición queda fuera del plano de este piso. Ubica la baliza dentro del plano.';
    if (code === 'INVALID_BEACON') return 'La baliza no cumple las reglas del inventario. Una baliza sin ubicar no puede estar activa.';
    if (error.status === 0) return 'No hay conexión con la API. Intenta de nuevo.';
    if (error.status === 403) return 'Tu cuenta no tiene permiso para esta operación.';
    if (error.status === 404) return 'La sede o la baliza ya no está disponible para tu cuenta.';
    if (error.status === 400) return 'Revisa los campos del formulario.';
    return fallback;
  }
}


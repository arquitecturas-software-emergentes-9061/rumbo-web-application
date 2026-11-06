import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Floor, Site } from '../../../../core/models/site-floor.model';
import { SitesService } from '../../../../core/services/sites.service';
import { AdminShellComponent } from '../../../../shared/admin-shell/admin-shell.component';
import { Beacon, BeaconInventoryService } from './beacon-inventory.service';

const pageSize = 6;
const errorMessages: Record<string, string> = {
  BEACON_IDENTIFIER_EXISTS: 'El identificador ya está registrado. Ingresa uno diferente.',
  INVALID_SPATIAL_ANCHOR: 'Las coordenadas deben estar dentro de un plano activo o en borrador del piso seleccionado.',
  INVALID_BEACON: 'Revisa el identificador y las coordenadas.',
  POSITIONING_RESOURCE_NOT_FOUND: 'La sede o la baliza ya no está disponible.',
  VALIDATION_FAILED: 'Revisa los campos obligatorios.',
};

@Component({
  selector: 'app-beacon-inventory',
  imports: [AdminShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './beacon-inventory.component.html',
  styleUrl: './beacon-inventory.component.css',
})
export class BeaconInventoryComponent {
  private readonly sitesApi = inject(SitesService);
  private readonly inventory = inject(BeaconInventoryService);
  private revision = 0;
  private dialog: HTMLDialogElement | null = null;

  protected readonly sites = signal<Site[]>([]);
  protected readonly floors = signal<Floor[]>([]);
  protected readonly beacons = signal<Beacon[]>([]);
  protected readonly siteId = signal('');
  protected readonly floorId = signal('');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly page = signal(0);
  protected readonly previousPage = (page: number) => page - 1;
  protected readonly nextPage = (page: number) => page + 1;
  protected readonly loading = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly formError = signal('');
  protected readonly formErrorCode = signal('');
  protected readonly editing = signal<Beacon | null>(null);
  protected readonly submitted = signal(false);
  protected readonly siteName = computed(() => this.sites().find(site => site.id === this.siteId())?.name ?? '');
  protected readonly activeCount = computed(() => this.beacons().filter(beacon => beacon.active).length);
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.status();
    return this.beacons().filter(beacon => beacon.identifier.includes(query)
      && (!status || beacon.active === (status === 'active')));
  });
  protected readonly pageStart = computed(() => this.page() * pageSize);
  protected readonly pageEnd = computed(() => Math.min(this.pageStart() + pageSize, this.filtered().length));
  protected readonly rows = computed(() => this.filtered().slice(this.pageStart(), this.pageEnd()));

  protected readonly form = new FormGroup({
    identifier: new FormControl('', { nonNullable: true, validators: [
      control => /^[a-zA-Z0-9:_-]{4,100}$/.test(control.value.trim()) ? null : { identifier: true },
    ] }),
    floorId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    x: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    y: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revision++);
    void this.loadSites();
  }

  protected async loadSites() {
    const revision = ++this.revision;
    this.loading.set('Cargando sedes…');
    this.error.set('');
    try {
      const sites = await firstValueFrom(this.sitesApi.loadSites());
      if (revision === this.revision) this.sites.set(sites);
    } catch (error) {
      this.showError(revision, error, 'No se pudieron cargar las sedes.');
    } finally {
      this.finish(revision);
    }
  }

  protected async chooseSite(siteId: string) {
    this.siteId.set(siteId);
    this.floorId.set('');
    this.floors.set([]);
    const revision = this.beginRead(siteId ? 'Cargando pisos e inventario…' : '');
    if (!siteId) return;
    try {
      const [floors, beacons] = await Promise.all([
        firstValueFrom(this.sitesApi.loadFloors(siteId)),
        firstValueFrom(this.inventory.list(siteId, '')),
      ]);
      if (revision !== this.revision) return;
      this.floors.set(floors);
      this.beacons.set(beacons);
    } catch (error) {
      this.showError(revision, error, 'No se pudieron cargar los pisos y las balizas de esta sede.');
    } finally {
      this.finish(revision);
    }
  }

  protected async chooseFloor(floorId: string) {
    this.floorId.set(floorId);
    const revision = this.beginRead('Consultando balizas…');
    try {
      const result = await firstValueFrom(this.inventory.list(this.siteId(), floorId));
      if (revision === this.revision) this.beacons.set(result);
    } catch (error) {
      this.showError(revision, error, 'No se pudo consultar el inventario.');
    } finally {
      this.finish(revision);
    }
  }

  protected retry() {
    if (!this.sites().length) void this.loadSites();
    else if (!this.floors().length) void this.chooseSite(this.siteId());
    else void this.chooseFloor(this.floorId());
  }

  protected filter(kind: 'search' | 'status', value: string) {
    this[kind].set(value);
    this.page.set(0);
  }

  protected floorName(floorId: string) {
    return this.floors().find(floor => floor.id === floorId)?.name ?? 'Piso no disponible';
  }

  protected open(dialog: HTMLDialogElement, beacon: Beacon | null) {
    this.editing.set(beacon);
    this.submitted.set(false);
    this.formError.set('');
    this.formErrorCode.set('');
    this.form.reset({
      floorId: this.floorId() || (this.floors().length === 1 ? this.floors()[0].id : ''),
    });
    this.dialog = dialog;
    dialog.showModal();
  }

  protected dismiss(event?: Event) {
    if (this.saving()) {
      event?.preventDefault();
      return;
    }
    this.dialog?.close();
    this.dialog = null;
  }

  protected async register() {
    if (this.saving()) return;
    this.submitted.set(true);
    this.formError.set('');
    this.formErrorCode.set('');
    const { floorId, identifier, x, y } = this.form.getRawValue();
    if (this.form.invalid || x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    await this.mutate(() => firstValueFrom(this.inventory.register(this.siteId(), {
      floorId, identifier: identifier.trim(), x, y,
    })), 'Baliza registrada y activa.');
  }

  protected async toggle(beacon: Beacon) {
    if (this.saving()) return;
    await this.mutate(
      () => firstValueFrom(this.inventory.setActive(this.siteId(), beacon.id, !beacon.active)),
      beacon.active ? 'Baliza desactivada.' : 'Baliza activada.',
    );
  }

  private async mutate(action: () => Promise<Beacon>, confirmation: string) {
    const revision = this.revision;
    this.saving.set(true);
    this.notice.set('');
    this.formError.set('');
    try {
      const saved = await action();
      if (revision !== this.revision) return;
      if (!this.floorId() || saved.floorId === this.floorId()) {
        this.beacons.update(items => [...items.filter(item => item.id !== saved.id), saved]
          .sort((first, second) => first.identifier.localeCompare(second.identifier)));
      }
      this.page.update(page => Math.min(page, Math.max(0, Math.ceil(this.filtered().length / pageSize) - 1)));
      this.notice.set(confirmation);
      this.dialog?.close();
      this.dialog = null;
    } catch (error) {
      if (revision === this.revision) {
        this.formErrorCode.set(error instanceof HttpErrorResponse ? error.error?.code ?? '' : '');
        this.formError.set(this.message(error, 'No se pudo guardar. Intenta nuevamente.'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  private beginRead(message: string) {
    this.beacons.set([]);
    this.page.set(0);
    this.notice.set('');
    this.error.set('');
    this.loading.set(message);
    return ++this.revision;
  }

  private finish(revision: number) {
    if (revision === this.revision) this.loading.set('');
  }

  private showError(revision: number, error: unknown, fallback: string) {
    if (revision === this.revision) this.error.set(this.message(error, fallback));
  }

  private message(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if (error.status === 401) return 'Tu sesión ya no está activa.';
    if (error.status === 403) return 'Tu cuenta no tiene permiso para gestionar balizas.';
    return errorMessages[error.error?.code] ?? fallback;
  }
}

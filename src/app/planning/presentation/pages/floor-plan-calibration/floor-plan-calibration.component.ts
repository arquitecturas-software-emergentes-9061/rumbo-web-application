import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SITES_PORT } from '../../../application/planning.ports';
import { Floor, Site } from '../../../domain/model/site-floor.model';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';
import { Calibration, PlanInterpretation, PlanVersion } from '../../../application/floor-plan.contracts';
import { Point } from '../../../domain/model/plan-interpretation';
import { FLOOR_PLANS_PORT } from '../../../application/planning.ports';
import { renderPdfPreview } from './plan-preview';

interface Preview {
  url: string;
  width: number;
  height: number;
}

const messages: Record<string, string> = {
  SITE_NOT_FOUND: 'La sede ya no está disponible. Selecciona otra sede.',
  FLOOR_NOT_FOUND: 'El piso ya no está disponible en esta sede.',
  PLAN_INVALID_CONTENT: 'El archivo está dañado o su contenido no coincide con el formato.',
  PLAN_UNSUPPORTED_TYPE: 'El formato no es compatible. Usa SVG, PDF, PNG o JPG.',
  PLAN_FILE_TOO_LARGE: 'El archivo supera el límite de 25 MB.',
  PLAN_EMPTY_FILE: 'El archivo está vacío. Selecciona un plano válido.',
  PLAN_INVALID_NAME: 'El nombre del archivo no es válido.',
  INVALID_SCALE_REFERENCE: 'Revisa que los puntos sean distintos, estén dentro del plano y la distancia sea positiva.',
  FLOOR_PLAN_NOT_FOUND: 'La versión del plano ya no está disponible para esta sede y piso.',
};

@Component({
  selector: 'app-floor-plan-calibration',
  imports: [AdminShellComponent, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './floor-plan-calibration.component.html',
  styleUrl: './floor-plan-calibration.component.css',
})
export class FloorPlanCalibrationComponent {
  private readonly sitesApi = inject(SITES_PORT);
  private readonly plans = inject(FLOOR_PLANS_PORT);
  private revision = 0;

  protected readonly sites = signal<Site[]>([]);
  protected readonly floors = signal<Floor[]>([]);
  protected readonly versions = signal<PlanVersion[]>([]);
  protected readonly siteId = signal('');
  protected readonly floorId = signal('');
  protected readonly selected = signal<PlanVersion | null>(null);
  protected readonly siteName = computed(() => this.sites().find(site => site.id === this.siteId())?.name ?? '');
  protected readonly step = signal<1 | 2>(1);
  protected readonly pending = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly preview = signal<Preview | null>(null);
  protected readonly zoom = signal(1);
  protected readonly points = signal<Point[]>([]);
  protected readonly cursor = signal<Point | null>(null);
  protected readonly distance = signal<number | null>(null);
  protected readonly unit = signal<Calibration['unit']>('METERS');
  protected readonly saved = signal<Calibration | null>(null);
  protected readonly interpretation = signal<PlanInterpretation | null>(null);
  protected readonly showProposal = signal(true);
  protected readonly proposalNodes = computed(() =>
    new Map(this.interpretation()?.proposal?.nodes.map(node => [node.id, node])));
  protected readonly dragOver = signal(false);
  protected readonly canSave = computed(() => {
    const distance = this.distance();
    return !this.pending() && this.preview() && this.points().length === 2 &&
      distance !== null && Number.isFinite(distance) && distance > 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.clearPreview();
    });
    void this.loadSites();
  }

  protected async loadSites() {
    const revision = ++this.revision;
    this.pending.set('Cargando sedes…');
    this.error.set('');
    try {
      const sites = await firstValueFrom(this.sitesApi.loadSites());
      if (revision === this.revision) this.sites.set(sites);
    } catch (error) {
      this.showError(revision, error, 'No pudimos cargar las sedes. Intenta de nuevo.');
    } finally {
      this.finish(revision);
    }
  }

  protected async chooseSite(siteId: string) {
    const revision = this.resetFloor();
    this.siteId.set(siteId);
    this.floors.set([]);
    if (!siteId) return;
    this.pending.set('Cargando pisos…');
    try {
      const floors = await firstValueFrom(this.sitesApi.loadFloors(siteId));
      if (revision === this.revision) this.floors.set(floors);
    } catch (error) {
      this.showError(revision, error, 'No pudimos cargar los pisos de la sede.');
    } finally {
      this.finish(revision);
    }
  }

  protected async chooseFloor(floorId: string) {
    const revision = this.resetFloor();
    this.floorId.set(floorId);
    if (!floorId) return;
    this.pending.set('Consultando planos…');
    try {
      const versions = await firstValueFrom(this.plans.list(this.siteId(), floorId));
      if (revision !== this.revision) return;
      this.versions.set(versions);
      this.selected.set(versions[0] ?? null);
    } catch (error) {
      this.showError(revision, error, 'No pudimos consultar las versiones de este piso.');
    } finally {
      this.finish(revision);
    }
  }

  protected chooseVersion(id: string) {
    this.selected.set(this.versions().find(version => version.id === id) ?? null);
    this.backToUpload();
  }

  protected filePicked(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.upload(file);
  }

  protected drag(event: DragEvent, active: boolean) {
    event.preventDefault();
    this.dragOver.set(active && !!this.floorId() && !this.pending());
  }

  protected drop(event: DragEvent) {
    this.drag(event, false);
    const files = event.dataTransfer?.files;
    if (files?.length === 1) void this.upload(files[0]);
    else if (this.floorId() && !this.pending()) this.error.set('Selecciona un solo archivo de plano.');
  }

  private async upload(file: File) {
    const floor = this.floorId();
    if (!floor || this.pending()) return;
    this.error.set('');
    this.message.set('');
    if (!/\.(svg|pdf|png|jpe?g)$/i.test(file.name)) {
      this.error.set(messages['PLAN_UNSUPPORTED_TYPE']);
      return;
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      this.error.set(messages[file.size ? 'PLAN_FILE_TOO_LARGE' : 'PLAN_EMPTY_FILE']);
      return;
    }
    const revision = ++this.revision;
    this.pending.set('Cargando archivo…');
    try {
      const version = await firstValueFrom(this.plans.upload(this.siteId(), floor, file));
      if (revision !== this.revision) return;
      this.versions.update(items => [version, ...items]);
      this.selected.set(version);
      this.message.set(`Versión ${version.version} cargada correctamente.`);
    } catch (error) {
      this.showError(revision, error, 'No pudimos cargar el plano. Puedes volver a intentarlo.');
    } finally {
      this.finish(revision);
    }
  }

  protected async openCalibration() {
    const version = this.selected();
    if (!version || this.pending()) return;
    const revision = ++this.revision;
    const site = this.siteId();
    this.resetCalibration();
    this.step.set(2);
    this.pending.set('Preparando vista previa…');
    try {
      const [original, saved] = await Promise.all([
        firstValueFrom(this.plans.original(site, this.floorId(), version.id)),
        firstValueFrom(this.plans.calibration(site, version.id)),
      ]);
      const width = Number(original.headers.get('X-Plan-Width'));
      const height = Number(original.headers.get('X-Plan-Height'));
      if (!original.body || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Missing dimensions');
      }
      if (revision !== this.revision) return;
      const image = version.mediaType === 'application/pdf' ? await renderPdfPreview(original.body) : original.body;
      if (revision !== this.revision) return;
      this.preview.set({ url: URL.createObjectURL(image), width, height });
      this.cursor.set({ x: width / 2, y: height / 2 });
      if (saved) this.restore(saved);
    } catch (error) {
      this.showError(revision, error, 'No pudimos abrir el plano para calibrarlo. Vuelve a intentarlo.');
    } finally {
      this.finish(revision);
    }
  }

  protected backToUpload() {
    this.revision++;
    this.pending.set('');
    this.resetCalibration();
    this.step.set(1);
  }

  protected async interpret() {
    const version = this.selected();
    if (!version || !this.preview() || this.pending()) return;
    const revision = ++this.revision;
    this.error.set('');
    this.message.set('');
    this.pending.set('Revisando la versión del plano…');
    try {
      const result = await firstValueFrom(this.plans.interpret(this.siteId(), this.floorId(), version.id));
      if (revision !== this.revision) return;
      this.interpretation.set(result);
      this.showProposal.set(true);
    } catch (error) {
      if (revision === this.revision) this.interpretation.set(null);
      const detail = error instanceof HttpErrorResponse && error.error?.code === 'INVALID_SVG_PLAN'
        ? error.error?.detail : null;
      this.showError(revision, error, typeof detail === 'string'
        ? detail : 'No pudimos interpretar esta versión. El original sigue disponible.');
    } finally {
      this.finish(revision);
    }
  }

  protected previewFailed() {
    this.clearPreview();
    this.error.set('No pudimos visualizar el archivo de esta versión.');
  }

  protected adjustZoom(increment: number) {
    this.zoom.update(value => increment ? Math.min(3, Math.max(1, value + increment)) : 1);
  }

  protected pick(event: MouseEvent) {
    const preview = this.preview();
    if (!preview || this.pending()) return;
    if (event.detail === 0) {
      const cursor = this.cursor();
      if (cursor) this.addPoint(cursor);
      return;
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.addPoint({
      x: Math.min(preview.width, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * preview.width)),
      y: Math.min(preview.height, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * preview.height)),
    });
  }

  protected moveCursor(event: KeyboardEvent) {
    const preview = this.preview(), cursor = this.cursor();
    const direction: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    };
    const offset = direction[event.key];
    if (!preview || !cursor || !offset) return;
    event.preventDefault();
    const increment = event.shiftKey ? 0.05 : 0.01;
    this.cursor.set({
      x: Math.min(preview.width, Math.max(0, cursor.x + offset.x * increment * preview.width)),
      y: Math.min(preview.height, Math.max(0, cursor.y + offset.y * increment * preview.height)),
    });
  }

  private addPoint(point: Point) {
    const points = this.points();
    if (points.length === 2) return;
    if (points[0]?.x === point.x && points[0]?.y === point.y) {
      this.error.set('Selecciona un punto diferente al punto A.');
      return;
    }
    this.error.set('');
    this.message.set('');
    this.points.update(items => [...items, point]);
  }

  protected clearPoints() {
    this.points.set([]);
    this.error.set('');
    this.message.set('');
  }

  protected async save() {
    const version = this.selected(), distance = this.distance();
    if (!version || distance === null || !this.canSave()) return;
    const revision = ++this.revision;
    const [start, end] = this.points();
    this.pending.set('Guardando calibración…');
    this.error.set('');
    this.message.set('');
    try {
      const saved = await firstValueFrom(this.plans.save(this.siteId(), version.id, {
        floorId: this.floorId(), unit: this.unit(), measuredDistance: distance,
        startX: start.x, startY: start.y, endX: end.x, endY: end.y,
      }));
      if (revision !== this.revision) return;
      this.restore(saved);
      this.message.set('Calibración guardada para esta versión.');
      this.interpretation.update(value => value ? {
        ...value, scaleStatus: 'CONFIRMED', metersPerUnit: saved.metersPerUnit,
      } : null);
    } catch (error) {
      this.showError(revision, error, 'No pudimos guardar la calibración. Puedes volver a intentarlo.');
    } finally {
      this.finish(revision);
    }
  }

  private restore(saved: Calibration) {
    this.saved.set(saved);
    this.points.set([{ x: saved.startX, y: saved.startY }, { x: saved.endX, y: saved.endY }]);
    this.distance.set(saved.measuredDistance);
    this.unit.set(saved.unit);
  }

  private resetFloor() {
    this.backToUpload();
    this.floorId.set('');
    this.versions.set([]);
    this.selected.set(null);
    return this.revision;
  }

  private resetCalibration() {
    this.clearPreview();
    this.zoom.set(1);
    this.clearPoints();
    this.cursor.set(null);
    this.saved.set(null);
    this.interpretation.set(null);
    this.distance.set(null);
    this.unit.set('METERS');
  }

  private clearPreview() {
    const preview = this.preview();
    if (preview) URL.revokeObjectURL(preview.url);
    this.preview.set(null);
  }

  private showError(revision: number, error: unknown, fallback: string) {
    if (revision !== this.revision) return;
    const code = error instanceof HttpErrorResponse ? error.error?.code : null;
    this.error.set(messages[code] ?? fallback);
  }

  private finish(revision: number) {
    if (revision === this.revision) this.pending.set('');
  }
}

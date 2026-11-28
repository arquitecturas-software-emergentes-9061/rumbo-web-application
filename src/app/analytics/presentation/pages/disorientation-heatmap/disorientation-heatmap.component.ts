import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { AdminShellComponent } from '../../../../shared/presentation/admin-shell/admin-shell.component';
import { ANALYTICS_PORT } from '../../../application/analytics.ports';
import {
  HeatLevel, NavigationHeatmap, PublishedSite, SiteModel, hotspots, placeCells, toCsv, toPeriod, wallSegments
} from '../../../domain/model/heatmap.model';

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

@Component({
  selector: 'app-disorientation-heatmap',
  imports: [AdminShellComponent, RouterLink],
  templateUrl: './disorientation-heatmap.component.html',
  styleUrl: './disorientation-heatmap.component.css'
})
export class DisorientationHeatmapComponent implements OnInit {
  private readonly analytics = inject(ANALYTICS_PORT);
  private readonly destroyRef = inject(DestroyRef);

  readonly legend: { level: HeatLevel; label: string }[] = [
    { level: 'low', label: 'Bajo (1–5 desvíos)' },
    { level: 'medium', label: 'Medio (6–15 desvíos)' },
    { level: 'high', label: 'Alto (16+ desvíos)' }
  ];

  readonly sites = signal<PublishedSite[]>([]);
  readonly siteId = signal<string | null>(null);
  readonly model = signal<SiteModel | null>(null);
  readonly heatmap = signal<NavigationHeatmap | null>(null);
  readonly floorId = signal<string | null>(null);
  readonly fromDate = signal(isoDate(Date.now() - 29 * DAY));
  readonly toDate = signal(isoDate(Date.now()));
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly periodError = signal<string | null>(null);
  readonly noMap = signal(false);
  readonly zoom = signal(1);
  readonly highlighted = signal<string | null>(null);
  readonly updatedAt = signal<Date | null>(null);

  readonly site = computed(() => this.sites().find(item => item.id === this.siteId()) ?? null);
  readonly floors = computed(() => [...(this.model()?.floors ?? [])].sort((a, b) => a.number - b.number));
  readonly floor = computed(() => this.floors().find(item => item.id === this.floorId()) ?? null);
  readonly plan = computed(() => this.model()?.plans.find(item => item.floorId === this.floorId()) ?? null);
  readonly placement = computed(() => {
    const model = this.model(), heatmap = this.heatmap(), floorId = this.floorId();
    return model && heatmap && floorId ? placeCells(heatmap, model, floorId) : { placed: [], unplaced: 0 };
  });
  readonly cells = computed(() => this.placement().placed.filter(cell => cell.level !== 'none'));
  readonly problems = computed(() => hotspots(this.placement().placed));
  readonly walls = computed(() => {
    const model = this.model(), floorId = this.floorId();
    if (!model || !floorId) return [];
    return model.walls.filter(wall => wall.floorId === floorId).flatMap(wall => wallSegments(wall, model.doors));
  });
  readonly floorNodes = computed(() => (this.model()?.nodes ?? []).filter(node => node.floorId === this.floorId()));
  readonly viewBox = computed(() => {
    const plan = this.plan();
    return plan ? `0 0 ${plan.widthUnits} ${plan.heightUnits}` : '0 0 100 100';
  });
  readonly unit = computed(() => {
    const plan = this.plan();
    return plan ? Math.max(plan.widthUnits, plan.heightUnits) / 100 : 1;
  });
  readonly hasData = computed(() => (this.heatmap()?.cells ?? []).some(cell => cell.deviations + cell.recalculations > 0));
  readonly floorHasData = computed(() => this.placement().placed.some(cell => cell.deviations + cell.recalculations > 0));

  ngOnInit(): void {
    this.analytics.listSites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: sites => {
        this.sites.set(sites);
        if (sites.length === 0) { this.loading.set(false); return; }
        this.selectSite(sites[0].id);
      },
      error: (error: HttpErrorResponse) => { this.loading.set(false); this.error.set(this.message(error)); }
    });
  }

  selectSite(id: string): void {
    this.siteId.set(id);
    this.model.set(null);
    this.heatmap.set(null);
    this.highlighted.set(null);
    this.load(true);
  }

  setFrom(value: string): void { this.fromDate.set(value); this.periodError.set(null); }
  setTo(value: string): void { this.toDate.set(value); this.periodError.set(null); }

  apply(): void { this.load(false); }

  selectFloor(id: string): void {
    this.floorId.set(id);
    this.highlighted.set(null);
  }

  zoomBy(delta: number): void { this.zoom.update(value => Math.min(3, Math.max(1, Math.round((value + delta) * 100) / 100))); }
  resetView(): void { this.zoom.set(1); this.highlighted.set(null); }
  show(nodeReference: string): void { this.highlighted.set(this.highlighted() === nodeReference ? null : nodeReference); }

  count(value: number, one: string, many: string): string { return `${value} ${value === 1 ? one : many}`; }

  exportCsv(): void {
    const model = this.model(), heatmap = this.heatmap(), site = this.site();
    if (!model || !heatmap || !site) return;
    const blob = new Blob([toCsv(heatmap, model)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mapa-de-calor-${site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${this.fromDate()}-${this.toDate()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private load(withModel: boolean): void {
    const siteId = this.siteId();
    if (!siteId) return;
    const period = toPeriod(this.fromDate(), this.toDate());
    if ('error' in period) { this.periodError.set(period.error); return; }
    this.periodError.set(null);
    this.error.set(null);
    this.loading.set(true);
    const heatmap$ = this.analytics.loadHeatmap(siteId, period.from, period.to);
    const request$ = withModel
      ? forkJoin({ model: this.analytics.loadModel(siteId), heatmap: heatmap$ })
      : forkJoin({ model: of(this.model()), heatmap: heatmap$ });
    request$.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: ({ model, heatmap }) => {
        this.noMap.set(model === null);
        this.model.set(model);
        this.heatmap.set(heatmap);
        this.updatedAt.set(new Date());
        const floors = this.floors();
        if (!floors.some(item => item.id === this.floorId())) {
          // Start on the floor with most incidents, as that is what the administrator came to see.
          const totals = new Map<string, number>();
          heatmap.cells.forEach(cell => totals.set(cell.floorId, (totals.get(cell.floorId) ?? 0) + cell.deviations + cell.recalculations));
          const busiest = [...floors].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))[0];
          this.floorId.set(busiest?.id ?? null);
        }
      },
      error: (error: HttpErrorResponse) => {
        if (error.error?.code === 'INVALID_DATE_RANGE' || error.status === 400) this.periodError.set('El periodo no es válido para la consulta.');
        else this.error.set(this.message(error));
      }
    });
  }

  private message(error: HttpErrorResponse): string {
    if (error.status === 0) return 'No hay conexión con la API. Intenta de nuevo.';
    if (error.status === 403) return 'Tu cuenta no tiene permiso para ver las analíticas de esta sede.';
    if (error.status === 503) return 'Las métricas no están disponibles en este momento. Intenta en unos minutos.';
    return 'No se pudo cargar el mapa de calor.';
  }
}

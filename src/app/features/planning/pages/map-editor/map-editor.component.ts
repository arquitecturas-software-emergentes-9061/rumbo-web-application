import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, finalize, of, switchMap } from 'rxjs';
import { Floor, Site } from '../../../../core/models/site-floor.model';
import { SitesService } from '../../../../core/services/sites.service';
import { AdminShellComponent } from '../../../../shared/admin-shell/admin-shell.component';
import { FloorPlansService, PlanVersion } from '../floor-plan-calibration/floor-plans.service';
import {
  ModelProposal, describeGenerationError, isEmptyProposal, isSvgVersion, nodeLabel, summarize, viewBoxFor, zoneFill
} from './model-preview';

type PanelTab = 'properties' | 'alerts';

@Component({
  selector: 'app-map-editor',
  imports: [AdminShellComponent, RouterLink],
  templateUrl: './map-editor.component.html',
  styleUrl: './map-editor.component.css'
})
export class MapEditorComponent implements OnInit {
  private readonly sitesApi = inject(SitesService);
  private readonly plansApi = inject(FloorPlansService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly floorSelection = new Subject<{ siteId: string; floorId: string } | null>();

  readonly sites = signal<Site[]>([]);
  readonly floors = signal<Floor[]>([]);
  readonly versions = signal<PlanVersion[]>([]);
  readonly siteId = signal<string | null>(null);
  readonly floorId = signal<string | null>(null);
  readonly versionId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly proposal = signal<ModelProposal | null>(null);
  readonly scaleProvisional = signal(true);
  readonly tab = signal<PanelTab>('properties');
  readonly selectedZoneId = signal<string | null>(null);

  readonly site = computed(() => this.sites().find(item => item.id === this.siteId()) ?? null);
  readonly floor = computed(() => this.floors().find(item => item.id === this.floorId()) ?? null);
  readonly version = computed(() => this.versions().find(item => item.id === this.versionId()) ?? null);
  readonly canGenerate = computed(() => isSvgVersion(this.version()) && !this.generating());
  readonly blockedReason = computed(() => {
    if (!this.floorId()) return 'Selecciona un piso.';
    if (this.versions().length === 0) return 'Este piso aún no tiene un plano. Cárgalo en Mapas.';
    if (!isSvgVersion(this.version())) {
      return 'Solo se puede generar el modelo desde un plano SVG vectorial. Este formato permite vista previa y calibración.';
    }
    return null;
  });
  readonly summary = computed(() => (this.proposal() ? summarize(this.proposal() as ModelProposal) : null));
  readonly viewBox = computed(() => {
    const box = viewBoxFor(this.proposal() ?? { zones: [], nodes: [], connections: [], wallCandidates: [], warnings: [] });
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  });
  readonly strokeUnit = computed(() => {
    const box = viewBoxFor(this.proposal() ?? { zones: [], nodes: [], connections: [], wallCandidates: [], warnings: [] });
    return Math.max(box.width, box.height) / 400;
  });
  readonly alerts = computed(() => {
    const current = this.proposal();
    if (!current) return [];
    const list = [...current.warnings];
    const expected = Math.max(current.zones.length - 1, 0);
    if (current.connections.length < expected) {
      list.push(`Se detectaron pocas conexiones (${current.connections.length}) para ${current.zones.length} ambientes. Revisa los recorridos antes de guardar el borrador.`);
    }
    if (this.scaleProvisional()) list.push('La escala es provisional: calibra el plano antes de publicar el mapa.');
    list.push('Las conexiones propuestas son candidatas. Revísalas antes de guardarlas como borrador.');
    return list;
  });
  readonly selectedZone = computed(() => this.proposal()?.zones.find(zone => zone.id === this.selectedZoneId()) ?? null);

  ngOnInit(): void {
    this.floorSelection.pipe(
      switchMap(selection => {
        this.versions.set([]);
        this.versionId.set(null);
        this.resetPreview();
        if (!selection) return of([] as PlanVersion[]);
        this.loading.set(true);
        return this.plansApi.list(selection.siteId, selection.floorId).pipe(
          catchError((error: HttpErrorResponse) => {
            this.error.set(describeGenerationError(error));
            return of([] as PlanVersion[]);
          }),
          finalize(() => this.loading.set(false))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(versions => {
      this.versions.set(versions);
      // The API lists the current original first.
      this.versionId.set(versions[0]?.id ?? null);
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
        this.selectSite(sites.find(item => item.id === this.siteId())?.id ?? sites[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadFailed.set(true);
        this.error.set(describeGenerationError(error));
      }
    });
  }

  selectSite(id: string | null): void {
    this.siteId.set(id);
    this.floors.set([]);
    this.floorId.set(null);
    this.floorSelection.next(null);
    this.error.set(null);
    if (!id) { this.loading.set(false); return; }
    this.loading.set(true);
    this.sitesApi.loadFloors(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: floors => {
        const sorted = [...floors].sort((a, b) => a.number - b.number);
        this.floors.set(sorted);
        this.selectFloor(sorted[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(describeGenerationError(error));
      }
    });
  }

  selectFloor(id: string | null): void {
    this.floorId.set(id);
    const siteId = this.siteId();
    if (!id || !siteId) { this.loading.set(false); this.floorSelection.next(null); return; }
    this.floorSelection.next({ siteId, floorId: id });
  }

  selectVersion(id: string): void {
    this.versionId.set(id);
    this.resetPreview();
  }

  generate(): void {
    const siteId = this.siteId(), floorId = this.floorId(), versionId = this.versionId();
    if (!siteId || !floorId || !versionId || !this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.plansApi.interpret(siteId, floorId, versionId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.generating.set(false))
    ).subscribe({
      next: result => {
        if (result.processing !== 'SVG_CANDIDATES' || !result.proposal) {
          this.resetPreview();
          this.notice.set('Este plano solo permite vista previa. Carga un SVG vectorial anotado para generar el modelo.');
          return;
        }
        if (isEmptyProposal(result.proposal)) {
          this.resetPreview();
          this.notice.set('No se reconoció ningún ambiente ni muro. Revisa que el SVG tenga las anotaciones de ambientes y puertas.');
          return;
        }
        this.proposal.set(result.proposal);
        this.scaleProvisional.set(result.scaleStatus !== 'CONFIRMED');
        this.selectedZoneId.set(null);
        this.tab.set(result.proposal.warnings.length > 0 ? 'alerts' : 'properties');
      },
      error: (error: HttpErrorResponse) => {
        this.resetPreview();
        this.error.set(describeGenerationError(error));
      }
    });
  }

  selectZone(id: string): void {
    this.selectedZoneId.set(id === this.selectedZoneId() ? null : id);
    this.tab.set('properties');
  }

  setTab(tab: PanelTab): void { this.tab.set(tab); }
  fill(category: string): string { return zoneFill(category); }
  labelOf(nodeId: string): string { return nodeLabel(this.proposal() as ModelProposal, nodeId); }

  connectionLine(connection: { fromNodeId: string; toNodeId: string }) {
    const nodes = this.proposal()?.nodes ?? [];
    const from = nodes.find(node => node.id === connection.fromNodeId);
    const to = nodes.find(node => node.id === connection.toNodeId);
    return from && to ? { x1: from.x, y1: from.y, x2: to.x, y2: to.y } : null;
  }

  private resetPreview(): void {
    this.proposal.set(null);
    this.selectedZoneId.set(null);
    this.notice.set(null);
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, catchError, finalize, of, switchMap } from 'rxjs';
import { Floor, Site } from '../../../../core/models/site-floor.model';
import { SitesService } from '../../../../core/services/sites.service';
import { AdminShellComponent } from '../../../../shared/admin-shell/admin-shell.component';
import { FloorPlansService, PlanVersion } from '../floor-plan-calibration/floor-plans.service';
import { GraphCanvasComponent } from './graph-canvas.component';
import { GraphEditorState, Tool } from './graph-editor-state';
import {
  CONNECTION_TYPES, ConnectionAccessibility, ConnectionType, DESTINATION_TYPES, DestinationType, NODE_TYPES, NodeType
} from './graph-model';
import { GraphAlert, countErrors } from './graph-validation';
import { DraftSnapshot, MapEditorApiService, SaveFailure, classifySaveError } from './map-editor-api.service';
import {
  ModelProposal, ZONE_CATEGORIES, categoryLabel, correctZone, describeDraftLoadError, describeGenerationError, isEmptyProposal,
  isSvgVersion, isUnlabeled, isolatedZones, nodeLabel, summarize, unlabeledZones, viewBoxFor, zoneFill
} from './model-preview';

type PanelTab = 'properties' | 'alerts';

const EMPTY_PROPOSAL: ModelProposal = { zones: [], nodes: [], connections: [], wallCandidates: [], warnings: [] };

@Component({
  selector: 'app-map-editor',
  imports: [AdminShellComponent, ReactiveFormsModule, RouterLink, GraphCanvasComponent],
  templateUrl: './map-editor.component.html',
  styleUrl: './map-editor.component.css'
})
export class MapEditorComponent implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly sitesApi = inject(SitesService);
  private readonly plansApi = inject(FloorPlansService);
  private readonly draftApi = inject(MapEditorApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly floorSelection = new Subject<{ siteId: string; floorId: string } | null>();

  readonly editor = new GraphEditorState();
  readonly nodeTypes = NODE_TYPES;
  readonly connectionTypes = CONNECTION_TYPES;
  readonly destinationTypes = DESTINATION_TYPES;
  readonly zoneCategories = ZONE_CATEGORIES;
  readonly tools: { id: Tool; label: string; hint: string }[] = [
    { id: 'select', label: 'Seleccionar', hint: 'Elige un nodo o una arista' },
    { id: 'node', label: 'Nodo', hint: 'Haz clic en el plano para agregar un nodo' },
    { id: 'edge', label: 'Arista', hint: 'Elige dos nodos para conectarlos' },
    { id: 'destination', label: 'Destino', hint: 'Elige un nodo para marcarlo como destino' },
    { id: 'move', label: 'Mover', hint: 'Arrastra un nodo; también puedes usar las flechas' }
  ];

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
  readonly success = signal<string | null>(null);
  readonly proposal = signal<ModelProposal | null>(null);
  readonly scaleProvisional = signal(true);
  readonly tab = signal<PanelTab>('properties');
  readonly selectedZoneId = signal<string | null>(null);
  readonly selectedLinkId = signal<string | null>(null);
  /** The proposal exactly as the API returned it, so manual corrections can be reverted. */
  private readonly generated = signal<ModelProposal | null>(null);

  readonly draft = signal<DraftSnapshot | null>(null);
  readonly draftLoading = signal(false);
  readonly saving = signal(false);
  readonly saveFailure = signal<SaveFailure | null>(null);
  readonly serverAlerts = signal<GraphAlert[]>([]);
  /** Rooms and walls of the last model applied to the draft, kept as read-only context. */
  readonly backdrop = signal<ModelProposal | null>(null);

  readonly zoneForm = this.fb.group({
    name: ['', [Validators.maxLength(150), (control: AbstractControl) => String(control.value).trim() ? null : { required: true }]],
    category: ['ROOM']
  });
  readonly nodeForm = this.fb.group({
    type: this.fb.control<NodeType>('INTERSECTION'),
    x: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    y: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)])
  });
  readonly destinationForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150), (control: AbstractControl) => String(control.value).trim() ? null : { required: true }]],
    type: this.fb.control<DestinationType>('SERVICE'),
    specialty: ['', Validators.maxLength(150)]
  });
  readonly connectionForm = this.fb.group({
    type: this.fb.control<ConnectionType>('CORRIDOR'),
    distanceMeters: this.fb.control<number | null>(1, [Validators.required, Validators.min(0.01)]),
    weight: this.fb.control<number | null>(1, [Validators.required, Validators.min(0.01)]),
    accessibility: this.fb.control<ConnectionAccessibility>('UNKNOWN'),
    bidirectional: [true]
  });

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
  readonly isolated = computed(() => (this.proposal() ? isolatedZones(this.proposal() as ModelProposal) : []));
  readonly unlabeled = computed(() => (this.proposal() ? unlabeledZones(this.proposal() as ModelProposal) : []));
  private readonly box = computed(() => viewBoxFor(this.proposal() ?? EMPTY_PROPOSAL));
  readonly viewBox = computed(() => `${this.box().x} ${this.box().y} ${this.box().width} ${this.box().height}`);
  readonly strokeUnit = computed(() => Math.max(this.box().width, this.box().height) / 400);
  readonly alerts = computed(() => {
    const current = this.proposal();
    if (!current) return [];
    const list = [...current.warnings];
    const expected = Math.max(current.zones.length - 1, 0);
    if (current.connections.length < expected) {
      list.push(`Se detectaron pocas conexiones (${current.connections.length}) para ${current.zones.length} ambientes. Revisa los recorridos antes de guardar el borrador.`);
    }
    const cut = this.isolated();
    if (cut.length > 0) {
      list.push(`${cut.length === 1 ? 'Un ambiente queda' : cut.length + ' ambientes quedan'} fuera de la red de recorridos: ${cut.map(zone => zone.name).join(', ')}. Ningún paciente podría llegar a ${cut.length === 1 ? 'él' : 'ellos'}.`);
    }
    const missing = this.unlabeled().length;
    if (missing > 0) {
      list.push(`${missing} ${missing === 1 ? 'ambiente no tiene' : 'ambientes no tienen'} una etiqueta confiable: confirma su tipo y nombre antes de publicar.`);
    }
    if (this.scaleProvisional()) list.push('La escala es provisional: calibra el plano antes de publicar el mapa.');
    list.push('Las conexiones propuestas son candidatas. Revísalas antes de guardarlas como borrador.');
    return list;
  });
  readonly selectedZone = computed(() => this.proposal()?.zones.find(zone => zone.id === this.selectedZoneId()) ?? null);

  readonly graphAlerts = computed<GraphAlert[]>(() => {
    const local = this.editor.alerts();
    const seen = new Set(local.map(alert => `${alert.code}|${alert.elementId}`));
    return [...local, ...this.serverAlerts().filter(alert => !seen.has(`${alert.code}|${alert.elementId}`))];
  });
  readonly graphErrorCount = computed(() => countErrors(this.graphAlerts()));
  readonly canSave = computed(() => !!this.draft() && this.editor.dirty() && !this.saving());
  readonly canApply = computed(() => !!this.draft() && !!this.proposal() && !!this.editor.plan());
  readonly proposalScaleBlocks = computed(() => this.editor.plan() !== null && this.editor.plan()?.metersPerUnit === null);
  readonly toolHint = computed(() => this.tools.find(item => item.id === this.editor.tool())?.hint ?? '');
  readonly selectedKindLabel = computed(() => this.editor.selectedNode() ? 'nodo' : this.editor.selectedConnection() ? 'arista' : null);

  constructor() {
    effect(() => {
      const node = this.editor.selectedNode();
      const entry = this.editor.selectedDestination();
      const link = this.editor.selectedConnection();
      const zone = this.selectedZone();
      if (zone) this.zoneForm.reset({ name: zone.name, category: zone.category.toUpperCase() });
      if (node || link) this.tab.set('properties');
      if (node) {
        this.nodeForm.reset({ type: node.type as NodeType, x: node.x, y: node.y });
        this.destinationForm.reset({
          name: entry?.name ?? '', type: (entry?.type as DestinationType) ?? 'SERVICE', specialty: entry?.specialty ?? ''
        });
      }
      if (link) {
        this.connectionForm.reset({
          type: link.type as ConnectionType, distanceMeters: link.distanceMeters, weight: link.weight,
          accessibility: link.accessibility as ConnectionAccessibility, bidirectional: link.bidirectional
        });
      }
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.editor.dirty()) event.preventDefault();
  }

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
        this.selectSite(sites.find(item => item.id === this.siteId())?.id ?? sites[0]?.id ?? null, true);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadFailed.set(true);
        this.error.set(describeGenerationError(error));
      }
    });
  }

  selectSite(id: string | null, force = false): void {
    if (!force && id !== this.siteId() && !this.confirmDiscard()) return;
    this.siteId.set(id);
    this.floors.set([]);
    this.floorId.set(null);
    this.floorSelection.next(null);
    this.error.set(null);
    this.draft.set(null);
    this.backdrop.set(null);
    this.editor.load({ nodes: [], connections: [], destinations: [] }, []);
    if (!id) { this.loading.set(false); return; }
    this.loading.set(true);
    this.loadDraft(id);
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
    this.editor.floorId.set(id);
    this.editor.select(null);
    const siteId = this.siteId();
    if (!id || !siteId) { this.loading.set(false); this.floorSelection.next(null); return; }
    this.floorSelection.next({ siteId, floorId: id });
  }

  selectVersion(id: string): void {
    this.versionId.set(id);
    this.resetPreview();
  }

  loadDraft(siteId: string): void {
    this.draftLoading.set(true);
    this.saveFailure.set(null);
    this.serverAlerts.set([]);
    this.draftApi.load(siteId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.draftLoading.set(false))).subscribe({
      next: snapshot => {
        this.draft.set(snapshot);
        this.editor.load(snapshot?.graph ?? { nodes: [], connections: [], destinations: [] }, snapshot?.plans ?? []);
        if (this.floorId()) this.editor.floorId.set(this.floorId());
      },
      error: (error: HttpErrorResponse) => this.error.set(describeDraftLoadError(error))
    });
  }

  reloadDraft(): void {
    const siteId = this.siteId();
    if (!siteId) return;
    if (this.editor.dirty() && !window.confirm('Se descartarán los cambios sin guardar. ¿Recargar el borrador?')) return;
    this.success.set(null);
    this.loadDraft(siteId);
  }

  generate(): void {
    const siteId = this.siteId(), floorId = this.floorId(), versionId = this.versionId();
    if (!siteId || !floorId || !versionId || !this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.success.set(null);
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
        this.generated.set(result.proposal);
        this.selectedLinkId.set(null);
        this.scaleProvisional.set(result.scaleStatus !== 'CONFIRMED');
        this.selectedZoneId.set(null);
        this.tab.set(result.proposal.warnings.length > 0 || unlabeledZones(result.proposal).length > 0 ? 'alerts' : 'properties');
      },
      error: (error: HttpErrorResponse) => {
        this.resetPreview();
        this.error.set(describeGenerationError(error));
      }
    });
  }

  applyProposal(): void {
    const current = this.proposal();
    if (!current) return;
    if (!this.draft()) { this.notice.set('La sede aún no tiene un borrador: la propuesta se queda como vista previa.'); return; }
    if (!this.editor.applyGenerated(current)) {
      this.notice.set('Calibra la escala del plano en Mapas antes de aplicar la propuesta al borrador: las distancias se miden en metros.');
      return;
    }
    this.backdrop.set(current);
    this.resetPreview();
    this.tab.set('properties');
    this.success.set('Propuesta aplicada al borrador. Revísala y guarda los cambios.');
  }

  discardProposal(): void { this.resetPreview(); this.tab.set('properties'); }

  applyZoneCorrection(): void {
    const id = this.selectedZoneId(), current = this.proposal();
    if (!id || !current || this.zoneForm.invalid) return this.zoneForm.markAllAsTouched();
    const { name, category } = this.zoneForm.getRawValue();
    this.proposal.set(correctZone(current, id, { name, category }));
    this.success.set('Ambiente corregido. La corrección se usará al aplicar la propuesta al borrador.');
  }

  resetZone(): void {
    const id = this.selectedZoneId(), original = this.generated()?.zones.find(zone => zone.id === id), current = this.proposal();
    if (!id || !original || !current) return;
    const restored = correctZone(current, id, { name: original.name, category: original.category });
    this.proposal.set(restored);
    this.zoneForm.reset({ name: original.name, category: original.category.toUpperCase() });
  }

  selectLink(id: string): void { this.selectedLinkId.set(id === this.selectedLinkId() ? null : id); }
  categoryName(category: string): string { return categoryLabel(category); }
  isIsolated(zoneId: string): boolean { return this.isolated().some(zone => zone.id === zoneId); }

  selectZone(id: string): void {
    this.selectedZoneId.set(id === this.selectedZoneId() ? null : id);
    this.tab.set('properties');
  }

  setTab(tab: PanelTab): void { this.tab.set(tab); }
  fill(category: string): string { return zoneFill(category); }
  unlabeledZone(zone: ModelProposal['zones'][number]): boolean { return isUnlabeled(zone); }
  labelOf(nodeId: string): string { return nodeLabel(this.proposal() as ModelProposal, nodeId); }

  connectionLine(connection: { fromNodeId: string; toNodeId: string }) {
    const nodes = this.proposal()?.nodes ?? [];
    const from = nodes.find(node => node.id === connection.fromNodeId);
    const to = nodes.find(node => node.id === connection.toNodeId);
    return from && to ? { x1: from.x, y1: from.y, x2: to.x, y2: to.y } : null;
  }

  chooseTool(tool: Tool): void { this.editor.setTool(tool); }

  applyNode(): void {
    const node = this.editor.selectedNode();
    const plan = this.editor.plan();
    if (!node || !plan || this.nodeForm.invalid) return this.nodeForm.markAllAsTouched();
    const { type, x, y } = this.nodeForm.getRawValue();
    if (type !== node.type) this.editor.setNodeType(node.id, type);
    if (x !== node.x || y !== node.y) this.editor.moveTo(node.id, x as number, y as number);
    if (type === 'DESTINATION') {
      if (this.destinationForm.invalid) return this.destinationForm.markAllAsTouched();
      const entry = this.destinationForm.getRawValue();
      this.editor.saveDestination(node.id, { name: entry.name, type: entry.type, specialty: entry.specialty || null });
    }
  }

  applyConnection(): void {
    const link = this.editor.selectedConnection();
    if (!link || this.connectionForm.invalid) return this.connectionForm.markAllAsTouched();
    const { type, distanceMeters, weight, accessibility, bidirectional } = this.connectionForm.getRawValue();
    this.editor.patchConnection(link.id, {
      type, accessibility, bidirectional, distanceMeters: distanceMeters as number, weight: weight as number
    });
  }

  focusAlert(alert: GraphAlert): void {
    if (alert.elementType === 'NODE' && alert.elementId) {
      const node = this.editor.graph().nodes.find(item => item.id === alert.elementId);
      if (node) { this.selectFloor(node.floorId); this.editor.select({ kind: 'node', id: node.id }); this.tab.set('properties'); }
    }
    if (alert.elementType === 'CONNECTION' && alert.elementId) {
      this.editor.select({ kind: 'connection', id: alert.elementId });
      this.tab.set('properties');
    }
  }

  save(): void {
    const snapshot = this.draft();
    if (!snapshot || !this.canSave()) return;
    this.saving.set(true);
    this.saveFailure.set(null);
    this.success.set(null);
    this.draftApi.save(snapshot, this.editor.graph()).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: next => {
        this.draft.set(next);
        this.serverAlerts.set([]);
        const floor = this.editor.floorId();
        this.editor.load(next.graph, next.plans);
        this.editor.floorId.set(floor);
        this.success.set('Borrador guardado.');
      },
      error: (error: HttpErrorResponse) => {
        const failure = classifySaveError(error);
        this.saveFailure.set(failure);
        this.serverAlerts.set(failure.issues);
        if (failure.kind === 'invalid') this.tab.set('alerts');
      }
    });
  }

  private confirmDiscard(): boolean {
    return !this.editor.dirty() || window.confirm('Hay cambios sin guardar en el borrador. ¿Descartarlos?');
  }

  private resetPreview(): void {
    this.proposal.set(null);
    this.generated.set(null);
    this.selectedLinkId.set(null);
    this.selectedZoneId.set(null);
    this.notice.set(null);
  }
}

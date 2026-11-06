import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Floor, Site } from '../../../../core/models/site-floor.model';
import { SitesService } from '../../../../core/services/sites.service';
import { AdminShellComponent } from '../../../../shared/admin-shell/admin-shell.component';
import { Accessibility, DraftGraphService, DraftSnapshot, GraphConnection, GraphNode, VerticalType } from './draft-graph.service';

const typeLabels: Record<VerticalType, string> = { ELEVATOR: 'Ascensor', STAIRS: 'Escalera', RAMP: 'Rampa' };
const accessLabels: Record<Accessibility, string> = {
  UNKNOWN: 'Sin verificar', ACCESSIBLE: 'Accesible', INACCESSIBLE: 'No accesible',
};

@Component({
  selector: 'app-interfloor-connections',
  imports: [AdminShellComponent, RouterLink, DecimalPipe],
  templateUrl: './interfloor-connections.component.html',
  styleUrl: './interfloor-connections.component.css',
})
export class InterfloorConnectionsComponent {
  private readonly sitesApi = inject(SitesService);
  private readonly graphs = inject(DraftGraphService);
  private request = 0;
  private dialog: HTMLDialogElement | null = null;

  protected readonly sites = signal<Site[]>([]);
  protected readonly siteId = signal('');
  protected readonly floors = signal<Floor[]>([]);
  protected readonly snapshot = signal<DraftSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly noDraft = signal(false);
  protected readonly stale = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly notice = signal('');

  protected readonly editing = signal<GraphConnection | null>(null);
  protected readonly fromFloor = signal('');
  protected readonly toFloor = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly type = signal<VerticalType>('ELEVATOR');
  protected readonly accessibility = signal<Accessibility>('UNKNOWN');
  protected readonly distance = signal<number | null>(null);
  protected readonly weight = signal<number | null>(null);
  protected readonly penalty = signal<number | null>(0);
  protected readonly bidirectional = signal(true);
  protected readonly types = typeLabels;
  protected readonly access = accessLabels;

  protected readonly siteName = computed(() => this.sites().find(site => site.id === this.siteId())?.name ?? '');
  protected readonly nodes = computed(() => this.snapshot()?.graph.nodes ?? []);
  private readonly nodeById = computed(() => new Map(this.nodes().map(node => [node.id, node])));
  protected readonly floorIds = computed(() => {
    const ids = new Set(this.nodes().map(node => node.floorId));
    const known = [...this.floors()].sort((a, b) => b.number - a.number).filter(floor => ids.delete(floor.id));
    return [...known.map(floor => floor.id), ...ids];
  });
  protected readonly fromNodes = computed(() => this.nodes().filter(node => node.floorId === this.fromFloor()));
  protected readonly toNodes = computed(() => this.nodes().filter(node => node.floorId === this.toFloor()));
  protected readonly links = computed(() => (this.snapshot()?.graph.connections ?? []).flatMap(link => {
    const start = this.nodeById().get(link.sourceNodeId);
    const end = this.nodeById().get(link.targetNodeId);
    return start && end && start.floorId !== end.floorId ? [{ link, start, end }] : [];
  }));
  protected readonly accessible = computed(() => this.links().filter(({ link }) => link.accessibility === 'ACCESSIBLE').length);
  protected readonly diagram = computed(() => {
    const rows = this.floorIds();
    return this.links().map(({ link, start, end }, index, links) => ({
      id: link.id, type: link.type, x: 152 + (index + 1) * 135 / (links.length + 1),
      y1: 25 + 36 * rows.indexOf(start.floorId), y2: 25 + 36 * rows.indexOf(end.floorId),
      accessible: link.accessibility === 'ACCESSIBLE',
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request++);
    void this.loadSites();
  }

  protected async loadSites() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const sites = await firstValueFrom(this.sitesApi.loadSites());
      if (request === this.request) this.sites.set(sites);
    } catch {
      if (request === this.request) this.error.set('No se pudieron cargar las sedes.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected async loadSite(siteId: string) {
    const request = ++this.request;
    this.siteId.set(siteId);
    this.snapshot.set(null);
    this.floors.set([]);
    this.noDraft.set(false);
    this.stale.set(false);
    this.error.set('');
    this.notice.set('');
    this.loading.set(!!siteId);
    if (!siteId) return;
    try {
      const [floors, draft] = await Promise.all([
        firstValueFrom(this.sitesApi.loadFloors(siteId)),
        firstValueFrom(this.graphs.load(siteId)),
      ]);
      if (request !== this.request) return;
      this.floors.set(floors);
      this.snapshot.set(draft);
    } catch (error) {
      if (request !== this.request) return;
      if (error instanceof HttpErrorResponse && error.status === 404) this.noDraft.set(true);
      else this.error.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'Tu cuenta no tiene acceso al borrador de esta sede.' : 'No se pudo abrir el borrador.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected floorName(id: string) {
    return this.floors().find(floor => floor.id === id)?.name ?? `Piso · ${id.slice(0, 8)}`;
  }

  protected nodeName(node: GraphNode) {
    const destination = this.snapshot()?.graph.destinations.find(item => item.nodeId === node.id);
    return destination?.name ?? `Nodo ${node.id.slice(0, 8)} · (${node.x}, ${node.y})`;
  }

  protected typeName(type: string) {
    return typeLabels[type as VerticalType] ?? type;
  }

  protected open(panel: HTMLDialogElement, existing: GraphConnection | null) {
    this.formError.set('');
    this.editing.set(existing);
    this.type.set((existing?.type as VerticalType) ?? 'ELEVATOR');
    this.accessibility.set(existing?.accessibility ?? 'UNKNOWN');
    this.fromFloor.set(this.nodeById().get(existing?.sourceNodeId ?? '')?.floorId ?? '');
    this.toFloor.set(this.nodeById().get(existing?.targetNodeId ?? '')?.floorId ?? '');
    this.from.set(existing?.sourceNodeId ?? '');
    this.to.set(existing?.targetNodeId ?? '');
    this.distance.set(existing?.distanceMeters ?? null);
    this.weight.set(existing?.weight ?? null);
    this.penalty.set(existing?.verticalPenalty ?? 0);
    this.bidirectional.set(existing?.bidirectional ?? true);
    this.dialog = panel;
    panel.showModal();
  }

  protected setFloor(endpoint: 'from' | 'to', value: string) {
    (endpoint === 'from' ? this.fromFloor : this.toFloor).set(value);
    (endpoint === 'from' ? this.from : this.to).set('');
  }

  protected close(event?: Event) {
    if (this.saving()) {
      event?.preventDefault();
      return;
    }
    this.dialog?.close();
    this.dialog = null;
  }

  protected async save() {
    const current = this.snapshot();
    if (!current || this.saving() || this.stale()) return;
    this.formError.set('');
    const from = this.nodeById().get(this.from());
    const to = this.nodeById().get(this.to());
    if (!from || !to || from.floorId === to.floorId || from.floorId !== this.fromFloor() || to.floorId !== this.toFloor()) {
      this.formError.set('Elige dos nodos de pisos distintos del mismo borrador.');
      return;
    }
    const distance = this.distance();
    const weight = this.weight() ?? distance;
    const penalty = this.penalty() ?? 0;
    if (distance === null || weight === null || ![distance, weight, penalty].every(Number.isFinite)
      || distance <= 0 || weight <= 0 || penalty < 0) {
      this.formError.set('Ingresa una distancia y un costo positivos, y una penalización igual o mayor que cero.');
      return;
    }
    this.saving.set(true);
    const request = this.request;
    try {
      const saved = await firstValueFrom(this.graphs.save(current, {
        id: this.editing()?.id ?? crypto.randomUUID(), sourceNodeId: from.id, targetNodeId: to.id,
        type: this.type(), distanceMeters: distance, weight, verticalPenalty: penalty,
        accessibility: this.accessibility(), bidirectional: this.bidirectional(),
      }));
      if (request !== this.request) return;
      this.snapshot.set(saved);
      this.notice.set('Conexión guardada en el borrador.');
      this.dialog?.close();
      this.dialog = null;
    } catch (error) {
      if (request !== this.request) return;
      if (error instanceof HttpErrorResponse && (error.status === 412 || error.status === 409)) {
        this.stale.set(true);
        this.formError.set('El borrador cambió. Recárgalo antes de volver a guardar.');
      } else if (error instanceof HttpErrorResponse && error.status === 422) {
        const issue = error.error?.issues?.[0];
        const messages: Record<string, string> = {
          DUPLICATE_CONNECTION: 'Ya existe una conexión de ese tipo entre los nodos seleccionados.',
          INVALID_VERTICAL_CONNECTION: 'Los nodos requieren una conexión vertical compatible.',
          MISSING_SOURCE_NODE: 'El nodo de origen ya no está disponible.',
          MISSING_TARGET_NODE: 'El nodo de destino ya no está disponible.',
        };
        this.formError.set(messages[issue?.code] ?? 'El servidor rechazó la conexión. Revisa los nodos y las medidas.');
      } else {
        this.formError.set('No se pudo guardar la conexión. Intenta de nuevo.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected reload() {
    this.close();
    void this.loadSite(this.siteId());
  }
}

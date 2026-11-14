import { computed, signal } from '@angular/core';
import { GraphConnection, GraphNode, MapWall, MapDoor } from '../domain/model/map-graph.types';
import { validWall, validDoor, crossingError, proposalGeometry } from '../domain/model/map-geometry';
import {
  ConnectionPatch, ConnectionRejection, Destination, DestinationInput, EMPTY_GRAPH, EditorGraph, IdFactory, NodeType, PlanBounds,
  addConnection, addNode, applyProposal, moveNode, nodeRemovalImpact, planFor, randomId, removeConnection, removeNode, updateConnection, updateNodeType,
  upsertDestination
} from '../domain/model/graph-model';
import { GraphHistory } from './graph-history';
import { verticalConnectionsForFloor } from '../domain/model/vertical-connection';
import { GraphAlert, validateGraph } from '../domain/model/graph-validation';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { ConnectionEnd, reconnectConnection } from '../domain/model/reconnect-connection';

export type Tool = 'select' | 'node' | 'edge' | 'destination' | 'reconnect' | 'wall' | 'door';
export type Selection = { kind: 'node' | 'connection' | 'wall' | 'door'; id: string };

const REJECTIONS: Record<ConnectionRejection, string> = {
  SAME_NODE: 'Elige dos nodos distintos para crear la arista.',
  DUPLICATE: 'Ya existe una conexión entre esos nodos.',
  MISSING_NODE: 'Uno de los nodos ya no existe.',
  DIFFERENT_FLOOR: 'Las conexiones entre pisos se gestionan en «Conexiones entre pisos».'
};

/** Editing session over a draft graph: working copy, undo/redo, selection and live validation. */
export class GraphEditorState {
  readonly graph = signal<EditorGraph>(EMPTY_GRAPH);
  readonly plans = signal<PlanBounds[]>([]);
  readonly floorId = signal<string | null>(null);
  readonly tool = signal<Tool>('select');
  readonly selection = signal<Selection | null>(null);
  readonly pendingFrom = signal<string | null>(null);
  readonly reconnecting = signal<{ connectionId: string; end: ConnectionEnd } | null>(null);
  readonly pendingWall = signal<{ x: number; y: number } | null>(null);
  readonly feedback = signal<string | null>(null);

  private readonly baseline = signal(JSON.stringify(EMPTY_GRAPH));
  private readonly revision = signal(0);
  private readonly history = new GraphHistory<EditorGraph>();

  constructor(private readonly newId: IdFactory = randomId) {}

  readonly dirty = computed(() => JSON.stringify(this.graph()) !== this.baseline());
  readonly geometryError = computed(() => crossingError(this.graph()));
  readonly canUndo = computed(() => (this.revision(), this.history.canUndo));
  readonly canRedo = computed(() => (this.revision(), this.history.canRedo));
  readonly plan = computed(() => { const id = this.floorId(); return id ? planFor(this.plans(), id) : null; });
  readonly floorNodes = computed(() => this.graph().nodes.filter(node => node.floorId === this.floorId()));
  readonly floorConnections = computed(() => {
    const ids = new Set(this.floorNodes().map(node => node.id));
    return this.graph().connections.filter(item => ids.has(item.sourceNodeId) && ids.has(item.targetNodeId));
  });
  readonly floorVerticalConnections = computed(() => verticalConnectionsForFloor(this.graph(), this.floorId()));
  readonly alerts = computed<GraphAlert[]>(() => validateGraph(this.graph(), this.plans()));
  readonly selectedNode = computed<GraphNode | null>(() => {
    const current = this.selection();
    return current?.kind === 'node' ? this.graph().nodes.find(node => node.id === current.id) ?? null : null;
  });
  readonly selectedConnection = computed<GraphConnection | null>(() => {
    const current = this.selection();
    return current?.kind === 'connection' ? this.graph().connections.find(item => item.id === current.id) ?? null : null;
  });
  readonly selectedDestination = computed<Destination | null>(() => {
    const node = this.selectedNode();
    return node ? this.graph().destinations.find(entry => entry.nodeId === node.id) ?? null : null;
  });
  readonly selectedNodeRemovalImpact = computed(() => {
    const node = this.selectedNode();
    return node ? nodeRemovalImpact(this.graph(), node.id) : null;
  });
  readonly floorWalls = computed(() => (this.graph().walls ?? []).filter(wall => wall.floorId === this.floorId()));
  readonly floorDoors = computed(() => (this.graph().doors ?? []).filter(door => this.floorWalls().some(wall => wall.id === door.wallId)));
  readonly selectedWall = computed(() => this.selection()?.kind === 'wall'
    ? this.graph().walls?.find(wall => wall.id === this.selection()?.id) ?? null : null);
  readonly selectedDoor = computed(() => this.selection()?.kind === 'door'
    ? this.graph().doors?.find(door => door.id === this.selection()?.id) ?? null : null);

  /** Replaces the working copy with a freshly loaded or saved draft. */
  load(graph: EditorGraph, plans: PlanBounds[]): void {
    const complete = { ...graph, walls: graph.walls ?? [], doors: graph.doors ?? [] };
    this.graph.set(complete);
    this.plans.set(plans);
    this.baseline.set(JSON.stringify(complete));
    this.history.clear();
    this.revision.update(value => value + 1);
    this.selection.set(null);
    this.tool.set('select');
    this.pendingFrom.set(null);
    this.reconnecting.set(null);
    this.feedback.set(null);
    this.pendingWall.set(null);
    if (!plans.some(plan => plan.floorId === this.floorId())) this.floorId.set(plans[0]?.floorId ?? null);
  }

  setTool(tool: Tool): void {
    this.tool.set(tool);
    this.pendingFrom.set(null);
    this.reconnecting.set(null);
    this.feedback.set(null);
    this.pendingWall.set(null);
  }

  select(selection: Selection | null): void { this.selection.set(selection); }

  canvasClick(x: number, y: number): void {
    if (this.tool() === 'wall') {
      const start = this.pendingWall(), plan = this.plan();
      if (!start) { this.pendingWall.set({ x, y }); this.feedback.set('Marca el segundo extremo del muro.'); return; }
      this.pendingWall.set(null);
      if (!plan) return;
      const wall: MapWall = { id: this.newId(), floorId: plan.floorId, planVersionId: plan.planVersionId,
        x1: start.x, y1: start.y, x2: x, y2: y };
      if (!validWall(wall, plan)) { this.feedback.set('El muro debe estar dentro del plano y tener longitud.'); return; }
      const next = { ...this.graph(), walls: [...(this.graph().walls ?? []), wall] };
      this.commit(next); this.select({ kind: 'wall', id: wall.id });
      this.feedback.set(crossingError(next)); return;
    }
    if (this.tool() !== 'node') { if (this.tool() === 'select') this.select(null); return; }
    const plan = this.plan();
    if (!plan) return;
    const id = this.newId();
    this.commit(addNode(this.graph(), plan, x, y, 'INTERSECTION', id));
    this.select({ kind: 'node', id });
  }

  nodeClick(id: string): void {
    switch (this.tool()) {
      case 'reconnect': return this.finishReconnect(id);
      case 'edge': return this.connect(id);
      case 'destination': {
        this.commit(updateNodeType(this.graph(), id, 'DESTINATION'));
        this.select({ kind: 'node', id });
        this.feedback.set('Completa el nombre del destino en el panel y aplica los cambios.');
        return;
      }
      default: this.select({ kind: 'node', id });
    }
  }

  connectionClick(id: string): void {
    if (this.tool() === 'edge' || this.tool() === 'node' || this.tool() === 'destination') return;
    this.select({ kind: 'connection', id });
  }

  wallClick(id: string, fraction = 0.5): void {
    if (this.tool() === 'door') {
      this.addDoor(id, Math.max(0, fraction - 0.08), Math.min(1, fraction + 0.08)); return;
    }
    this.select({ kind: 'wall', id });
  }

  addDoor(wallId: string, from: number, to: number): boolean {
    const door: MapDoor = { id: this.newId(), wallId, from, to };
    if (!validDoor(door, this.graph())) { this.feedback.set('La abertura debe estar sobre un muro y no superponerse con otra puerta.'); return false; }
    const next = { ...this.graph(), doors: [...(this.graph().doors ?? []), door] };
    this.commit(next); this.select({ kind: 'door', id: door.id }); this.feedback.set(null);
    return true;
  }

  doorClick(id: string): void { this.select({ kind: 'door', id }); }

  updateWall(id: string, patch: Pick<MapWall, 'x1' | 'y1' | 'x2' | 'y2'>): void {
    const current = this.graph().walls?.find(wall => wall.id === id), plan = this.plan();
    if (!current) return;
    const wall = { ...current, ...patch };
    if (!validWall(wall, plan)) { this.feedback.set('El muro debe quedar dentro del plano.'); return; }
    const next = { ...this.graph(), walls: this.graph().walls?.map(item => item.id === id ? wall : item) };
    this.commit(next); this.feedback.set(crossingError(next));
  }

  updateDoor(id: string, from: number, to: number): void {
    const current = this.graph().doors?.find(door => door.id === id);
    if (!current) return;
    const door = { ...current, from, to };
    if (!validDoor(door, this.graph())) { this.feedback.set('Abertura inválida o superpuesta.'); return; }
    const next = { ...this.graph(), doors: this.graph().doors?.map(item => item.id === id ? door : item) };
    this.commit(next); this.feedback.set(crossingError(next));
  }

  moveTo(id: string, x: number, y: number): void {
    const plan = this.plan();
    const node = this.graph().nodes.find(item => item.id === id);
    if (!plan || !node) return;
    const next = moveNode(this.graph(), id, plan, x, y);
    if (JSON.stringify(next) !== JSON.stringify(this.graph())) this.commit(next);
  }

  setNodeType(id: string, type: NodeType): void { this.commit(updateNodeType(this.graph(), id, type)); }

  saveDestination(nodeId: string, input: DestinationInput): void {
    this.commit(upsertDestination(this.graph(), nodeId, input, this.newId()));
  }

  patchConnection(id: string, patch: ConnectionPatch): void { this.commit(updateConnection(this.graph(), id, patch)); }

  beginReconnect(end: ConnectionEnd): void {
    const connection = this.selectedConnection();
    if (!connection) return;
    this.tool.set('reconnect');
    this.pendingFrom.set(null);
    this.reconnecting.set({ connectionId: connection.id, end });
    this.feedback.set(`Selecciona el nuevo nodo de ${end === 'source' ? 'origen' : 'destino'} para la arista.`);
  }

  startConnectionFrom(nodeId: string): void {
    if (!this.graph().nodes.some(node => node.id === nodeId)) return;
    this.setTool('edge');
    this.pendingFrom.set(nodeId);
    this.feedback.set('Selecciona el nodo aislado para extender la arista desde el nodo marcado.');
  }

  cancelReconnect(): void { this.setTool('select'); }

  deleteSelection(): void {
    const current = this.selection();
    if (!current) return;
    const graph = this.graph();
    const next = current.kind === 'node' ? removeNode(graph, current.id)
      : current.kind === 'connection' ? removeConnection(graph, current.id)
      : current.kind === 'wall' ? { ...graph, walls: graph.walls?.filter(wall => wall.id !== current.id),
          doors: graph.doors?.filter(door => door.wallId !== current.id) }
      : { ...graph, doors: graph.doors?.filter(door => door.id !== current.id) };
    this.commit(next);
    this.feedback.set(crossingError(next));
    this.selection.set(null);
    this.reconnecting.set(null);
  }

  applyGenerated(proposal: ModelProposal, editedGeometry?: Pick<EditorGraph, 'walls' | 'doors'>): boolean {
    const plan = this.plan();
    if (!plan || plan.metersPerUnit === null) return false;
    const generated = applyProposal(this.graph(), proposal, plan, this.newId);
    const walls = [...(this.graph().walls ?? [])];
    const doors = [...(this.graph().doors ?? [])];
    const geometry = editedGeometry ? {
      walls: [...walls], doors: [...doors]
    } : proposalGeometry(proposal, plan, { ...generated, walls, doors }, this.newId);
    if (editedGeometry) {
      const wallIds = new Map<string, string>();
      for (const candidate of editedGeometry.walls ?? []) {
        const match = geometry.walls.find(wall => wall.planVersionId === plan.planVersionId
          && ((Math.hypot(wall.x1 - candidate.x1, wall.y1 - candidate.y1) < 1e-3
            && Math.hypot(wall.x2 - candidate.x2, wall.y2 - candidate.y2) < 1e-3)
            || (Math.hypot(wall.x1 - candidate.x2, wall.y1 - candidate.y2) < 1e-3
              && Math.hypot(wall.x2 - candidate.x1, wall.y2 - candidate.y1) < 1e-3)));
        wallIds.set(candidate.id, match?.id ?? candidate.id);
        if (!match) geometry.walls.push({ ...candidate, floorId: plan.floorId, planVersionId: plan.planVersionId });
      }
      for (const candidate of editedGeometry.doors ?? []) {
        const door = { ...candidate, wallId: wallIds.get(candidate.wallId) ?? candidate.wallId };
        if (!geometry.doors.some(item => item.wallId === door.wallId
          && Math.abs(item.from - door.from) < 1e-3 && Math.abs(item.to - door.to) < 1e-3)) geometry.doors.push(door);
      }
    }
    this.commit({ ...generated, walls: geometry.walls, doors: geometry.doors });
    this.selection.set(null);
    return true;
  }

  undo(): void { this.step(this.history.undo(this.graph())); }
  redo(): void { this.step(this.history.redo(this.graph())); }

  private connect(id: string): void {
    const from = this.pendingFrom();
    if (!from) { this.pendingFrom.set(id); this.feedback.set('Elige el segundo nodo para crear la arista.'); return; }
    const result = addConnection(this.graph(), from, id, this.plans(), this.newId());
    this.pendingFrom.set(null);
    if (result.rejected) { this.feedback.set(REJECTIONS[result.rejected]); return; }
    if (crossingError(result.graph)) { this.feedback.set('La arista atraviesa un muro; crea una puerta y usa DOORWAY.'); return; }
    this.commit(result.graph);
    const created = result.graph.connections[result.graph.connections.length - 1];
    this.select({ kind: 'connection', id: created.id });
    this.feedback.set(null);
  }

  private finishReconnect(nodeId: string): void {
    const pending = this.reconnecting();
    if (!pending) return;
    const result = reconnectConnection(this.graph(), pending.connectionId, pending.end, nodeId, this.plans());
    if (result.rejected) { this.feedback.set(REJECTIONS[result.rejected]); return; }
    if (result.graph !== this.graph()) this.commit(result.graph);
    this.tool.set('select');
    this.reconnecting.set(null);
    this.select({ kind: 'connection', id: pending.connectionId });
    this.feedback.set(null);
  }

  private commit(next: EditorGraph): void {
    this.history.record(this.graph());
    this.graph.set(next);
    this.revision.update(value => value + 1);
  }

  private step(snapshot: EditorGraph | null): void {
    if (!snapshot) return;
    this.graph.set(snapshot);
    this.revision.update(value => value + 1);
    const current = this.selection();
    const exists = current && (current.kind === 'node' ? snapshot.nodes.some(node => node.id === current.id)
      : current.kind === 'connection' ? snapshot.connections.some(item => item.id === current.id)
      : current.kind === 'wall' ? snapshot.walls?.some(item => item.id === current.id)
      : snapshot.doors?.some(item => item.id === current.id));
    if (!exists) this.selection.set(null);
  }
}

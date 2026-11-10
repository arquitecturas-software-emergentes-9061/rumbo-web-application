import { computed, signal } from '@angular/core';
import { GraphConnection, GraphNode } from '../domain/model/map-graph.types';
import {
  ConnectionPatch, ConnectionRejection, Destination, DestinationInput, EMPTY_GRAPH, EditorGraph, IdFactory, NodeType, PlanBounds,
  addConnection, addNode, applyProposal, moveNode, planFor, randomId, removeConnection, removeNode, updateConnection, updateNodeType,
  upsertDestination
} from '../domain/model/graph-model';
import { GraphHistory } from './graph-history';
import { GraphAlert, validateGraph } from '../domain/model/graph-validation';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { ConnectionEnd, reconnectConnection } from '../domain/model/reconnect-connection';

export type Tool = 'select' | 'node' | 'edge' | 'destination' | 'move' | 'reconnect';
export type Selection = { kind: 'node' | 'connection'; id: string };

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
  readonly feedback = signal<string | null>(null);

  private readonly baseline = signal(JSON.stringify(EMPTY_GRAPH));
  private readonly revision = signal(0);
  private readonly history = new GraphHistory<EditorGraph>();

  constructor(private readonly newId: IdFactory = randomId) {}

  readonly dirty = computed(() => JSON.stringify(this.graph()) !== this.baseline());
  readonly canUndo = computed(() => (this.revision(), this.history.canUndo));
  readonly canRedo = computed(() => (this.revision(), this.history.canRedo));
  readonly plan = computed(() => { const id = this.floorId(); return id ? planFor(this.plans(), id) : null; });
  readonly floorNodes = computed(() => this.graph().nodes.filter(node => node.floorId === this.floorId()));
  readonly floorConnections = computed(() => {
    const ids = new Set(this.floorNodes().map(node => node.id));
    return this.graph().connections.filter(item => ids.has(item.sourceNodeId) && ids.has(item.targetNodeId));
  });
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

  /** Replaces the working copy with a freshly loaded or saved draft. */
  load(graph: EditorGraph, plans: PlanBounds[]): void {
    this.graph.set(graph);
    this.plans.set(plans);
    this.baseline.set(JSON.stringify(graph));
    this.history.clear();
    this.revision.update(value => value + 1);
    this.selection.set(null);
    this.tool.set('select');
    this.pendingFrom.set(null);
    this.reconnecting.set(null);
    this.feedback.set(null);
    if (!plans.some(plan => plan.floorId === this.floorId())) this.floorId.set(plans[0]?.floorId ?? null);
  }

  setTool(tool: Tool): void {
    this.tool.set(tool);
    this.pendingFrom.set(null);
    this.reconnecting.set(null);
    this.feedback.set(null);
  }

  select(selection: Selection | null): void { this.selection.set(selection); }

  canvasClick(x: number, y: number): void {
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
    this.commit(current.kind === 'node' ? removeNode(this.graph(), current.id) : removeConnection(this.graph(), current.id));
    this.selection.set(null);
    this.reconnecting.set(null);
  }

  applyGenerated(proposal: ModelProposal): boolean {
    const plan = this.plan();
    if (!plan || plan.metersPerUnit === null) return false;
    this.commit(applyProposal(this.graph(), proposal, plan, this.newId));
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
    const exists = current && (current.kind === 'node'
      ? snapshot.nodes.some(node => node.id === current.id) : snapshot.connections.some(item => item.id === current.id));
    if (!exists) this.selection.set(null);
  }
}

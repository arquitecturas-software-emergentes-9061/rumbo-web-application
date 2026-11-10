import { Component, computed, input, output, signal } from '@angular/core';
import { GraphConnection, GraphNode } from '../interfloor-connections/draft-graph.service';
import { Destination, PlanBounds } from '../../domain/model/map-graph.types';
import { Selection, Tool } from '../../application/graph-editor-state';
import { ModelProposal, polygonPath, zoneFill, zonePath } from './model-preview';

interface DragState { id: string; x: number; y: number; moved: boolean }

const NODE_COLORS: Record<string, string> = {
  ACCESS: '#1b5a46', DESTINATION: '#9f2629', INTERSECTION: '#096a99', VERTICAL_LINK: '#654516', REFERENCE: '#506a80'
};

/** Interactive SVG view of one floor of the draft graph: select, add, connect, drag. */
@Component({
  selector: 'app-graph-canvas',
  templateUrl: './graph-canvas.component.html',
  styleUrl: './graph-canvas.component.css'
})
export class GraphCanvasComponent {
  protected readonly polygonPath = polygonPath;
  protected readonly zonePath = zonePath;
  readonly nodes = input.required<GraphNode[]>();
  readonly connections = input.required<GraphConnection[]>();
  readonly destinations = input<Destination[]>([]);
  readonly plan = input.required<PlanBounds | null>();
  readonly tool = input<Tool>('select');
  readonly selection = input<Selection | null>(null);
  readonly pendingFrom = input<string | null>(null);
  /** Rooms and walls of the last applied model, drawn read-only behind the graph for context. */
  readonly backdrop = input<ModelProposal | null>(null);
  readonly interactiveZones = input(false);
  readonly selectedZoneId = input<string | null>(null);
  protected readonly zoom = signal(1);
  private readonly center = signal<{ x: number; y: number } | null>(null);

  readonly canvasPoint = output<{ x: number; y: number }>();
  readonly nodePicked = output<string>();
  readonly connectionPicked = output<string>();
  readonly nodeMoved = output<{ id: string; x: number; y: number }>();
  readonly zonePicked = output<string>();

  protected readonly drag = signal<DragState | null>(null);

  protected readonly unit = computed(() => {
    const plan = this.plan();
    return plan ? Math.max(plan.widthUnits, plan.heightUnits) / 400 : 1;
  });

  protected readonly viewBox = computed(() => {
    const plan = this.plan();
    if (!plan) return '0 0 100 100';
    const zoom = this.zoom(), width = plan.widthUnits / zoom, height = plan.heightUnits / zoom;
    const center = this.center() ?? { x: plan.widthUnits / 2, y: plan.heightUnits / 2 };
    const x = Math.min(Math.max(center.x - width / 2, 0), plan.widthUnits - width);
    const y = Math.min(Math.max(center.y - height / 2, 0), plan.heightUnits - height);
    return `${x} ${y} ${width} ${height}`;
  });

  zoomIn(): void { this.zoom.update(value => Math.min(4, Math.round((value + 0.25) * 100) / 100)); }
  zoomOut(): void { this.zoom.update(value => Math.max(1, Math.round((value - 0.25) * 100) / 100)); }
  fit(): void { this.zoom.set(1); this.center.set(null); }

  focusOn(selection: Selection): void {
    const byId = new Map(this.nodes().map(node => [node.id, node]));
    if (selection.kind === 'node') {
      const node = byId.get(selection.id);
      if (node) this.focusPoint(node.x, node.y);
    } else {
      const link = this.connections().find(item => item.id === selection.id);
      const source = link && byId.get(link.sourceNodeId), target = link && byId.get(link.targetNodeId);
      if (source && target) this.focusPoint((source.x + target.x) / 2, (source.y + target.y) / 2);
    }
  }

  focusPoint(x: number, y: number): void {
    this.center.set({ x, y });
    this.zoom.set(2);
  }

  protected readonly positioned = computed(() => {
    const dragging = this.drag();
    return this.nodes().map(node => dragging?.id === node.id ? { ...node, x: dragging.x, y: dragging.y } : node);
  });

  protected readonly lines = computed(() => {
    const byId = new Map(this.positioned().map(node => [node.id, node]));
    return this.connections().flatMap(connection => {
      const from = byId.get(connection.sourceNodeId), to = byId.get(connection.targetNodeId);
      return from && to ? [{ connection, x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : [];
    });
  });

  protected fill(category: string): string { return zoneFill(category); }
  protected pickZone(event: Event, id: string): void {
    if (!this.interactiveZones() || this.tool() !== 'select') return;
    event.stopPropagation();
    this.zonePicked.emit(id);
  }

  protected color(node: GraphNode): string { return NODE_COLORS[node.type] ?? NODE_COLORS['REFERENCE']; }

  protected label(node: GraphNode): string {
    return this.destinations().find(entry => entry.nodeId === node.id)?.name ?? '';
  }

  protected isSelected(kind: 'node' | 'connection', id: string): boolean {
    const current = this.selection();
    return current?.kind === kind && current.id === id;
  }

  protected canvasClicked(event: MouseEvent): void {
    const point = this.toPlan(event.clientX, event.clientY, event.currentTarget as SVGGraphicsElement);
    if (point) this.canvasPoint.emit(point);
  }

  protected nodeDown(event: PointerEvent, node: GraphNode): void {
    event.stopPropagation();
    const tool = this.tool();
    if (tool !== 'select' && tool !== 'move') return;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.drag.set({ id: node.id, x: node.x, y: node.y, moved: false });
  }

  protected pointerMoved(event: PointerEvent): void {
    const current = this.drag();
    if (!current) return;
    const point = this.toPlan(event.clientX, event.clientY, event.currentTarget as SVGGraphicsElement);
    if (point) this.drag.set({ ...current, ...point, moved: true });
  }

  protected pointerUp(event: PointerEvent, node: GraphNode): void {
    event.stopPropagation();
    const current = this.drag();
    this.drag.set(null);
    if (current?.moved && this.tool() === 'move') this.nodeMoved.emit({ id: node.id, x: current.x, y: current.y });
    else if (current?.moved) this.nodeMoved.emit({ id: node.id, x: current.x, y: current.y });
    else this.nodePicked.emit(node.id);
  }

  protected nodeClicked(event: MouseEvent, node: GraphNode): void {
    event.stopPropagation();
    const tool = this.tool();
    // Pointer interactions already handled select/move; other tools act on a plain click.
    if (tool !== 'select' && tool !== 'move') this.nodePicked.emit(node.id);
  }

  protected nodeKey(event: KeyboardEvent, node: GraphNode): void {
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]
    };
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.nodePicked.emit(node.id); return; }
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    this.nodeMoved.emit({ id: node.id, x: node.x + delta[0], y: node.y + delta[1] });
  }

  protected lineClicked(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.connectionPicked.emit(id);
  }

  private toPlan(clientX: number, clientY: number, element: SVGGraphicsElement) {
    const svg = (element.ownerSVGElement ?? element) as SVGSVGElement;
    const matrix = svg.getScreenCTM?.();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }
}

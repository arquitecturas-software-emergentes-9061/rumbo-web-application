import { validateGraph } from '../domain/model/graph-validation';
import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { proposalGraphResult } from './proposal-graph';

const plan: PlanBounds = { floorId: 'floor', planVersionId: 'version', widthUnits: 100,
  heightUnits: 60, metersPerUnit: 1 };
const proposal = (doors: ModelProposal['doors'] = []): ModelProposal => ({
  zones: [], warnings: [], wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 60 }], doors,
  nodes: [{ id: 'access', label: 'Entrada', role: 'ACCESS', x: 20, y: 30 },
    { id: 'destination', label: 'Destino', role: 'DESTINATION', x: 80, y: 30 }],
  connections: [{ id: 'route', fromNodeId: 'access', toNodeId: 'destination', distanceUnits: 60,
    graphType: 'CORRIDOR' }]
});

describe('generated model geometry and graph', () => {
  it('excludes a solid-wall crossing and reports it before saving', () => {
    const result = proposalGraphResult(proposal(), plan);
    expect(result.graph.walls).toHaveLength(1);
    expect(result.graph.connections).toHaveLength(0);
    expect(result.warnings.some(message => message.includes('Se excluyeron 1 conexiones'))).toBe(true);
  });

  it('uses DOORWAY through a recognized opening and produces a valid graph', () => {
    const result = proposalGraphResult(proposal([{ id: 'opening', x1: 50, y1: 25, x2: 50, y2: 35 }]), plan);
    expect(result.graph.doors).toHaveLength(1);
    expect(result.graph.connections).toHaveLength(1);
    expect(result.graph.connections[0].type).toBe('DOORWAY');
    expect(validateGraph(result.graph, [plan]).filter(issue => issue.severity === 'error')).toEqual([]);
  });

  it('changes an unsupported DOORWAY to CORRIDOR on open floor', () => {
    const input = proposal();
    input.wallCandidates = [];
    input.connections[0].graphType = 'DOORWAY';
    const result = proposalGraphResult(input, plan);
    expect(result.graph.connections.map(link => link.type)).toEqual(['CORRIDOR']);
    expect(result.warnings).toEqual([]);
  });

  it('keeps DOORWAY when a route terminates at a confirmed opening', () => {
    const input = proposal([{ id: 'opening', x1: 50, y1: 25, x2: 50, y2: 35 }]);
    input.nodes[0].x = 50;
    input.connections[0].graphType = 'DOORWAY';
    expect(proposalGraphResult(input, plan).graph.connections.map(link => link.type)).toEqual(['DOORWAY']);
  });

  it('deduplicates links and respects walls already in the draft', () => {
    const input = proposal();
    input.wallCandidates = [];
    input.connections.push({ ...input.connections[0], id: 'duplicate', fromNodeId: 'destination',
      toNodeId: 'access' });
    const existing: EditorGraph = { nodes: [], connections: [], destinations: [],
      walls: [{ id: 'existing', floorId: plan.floorId, planVersionId: plan.planVersionId,
        x1: 50, y1: 0, x2: 50, y2: 60 }], doors: [] };
    const result = proposalGraphResult(input, plan, existing);
    expect(result.graph.walls?.map(wall => wall.id)).toEqual(['existing']);
    expect(result.graph.connections).toHaveLength(0);
    expect(proposalGraphResult(input, plan).graph.connections).toHaveLength(1);
  });

  it('summarizes many blocked candidates in one visible diagnosis', () => {
    const input = proposal();
    input.nodes = Array.from({ length: 80 }, (_, index) => [
      { id: `left-${index}`, label: 'Izquierda', x: 20, y: (index + 1) * .7 },
      { id: `right-${index}`, label: 'Derecha', x: 80, y: (index + 1) * .7 }
    ]).flat();
    input.connections = Array.from({ length: 80 }, (_, index) => ({
      id: `route-${index}`, fromNodeId: `left-${index}`, toNodeId: `right-${index}`,
      distanceUnits: 60, graphType: 'DOORWAY' as const
    }));
    const result = proposalGraphResult(input, plan);
    expect(result.graph.connections).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Se excluyeron 80 conexiones');
  });
});

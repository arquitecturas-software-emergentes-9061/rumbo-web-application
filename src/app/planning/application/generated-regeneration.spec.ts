import { GraphEditorState } from './graph-editor-state';
import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { proposalGraphResult } from './proposal-graph';

describe('generated model regeneration', () => {
  it('keeps existing geometry, destinations and other floors without duplicating doors', () => {
    const plan: PlanBounds = { floorId: 'floor', planVersionId: 'version', widthUnits: 100,
      heightUnits: 100, metersPerUnit: 1 };
    const wall = { id: 'saved-wall', floorId: 'floor', planVersionId: 'version',
      x1: 50, y1: 0, x2: 50, y2: 100 };
    const door = { id: 'saved-door', wallId: wall.id, from: .45, to: .55 };
    const original: EditorGraph = {
      nodes: [{ id: 'old-destination', floorId: 'floor', planVersionId: 'version', x: 80, y: 50,
        type: 'DESTINATION' }, { id: 'other', floorId: 'other-floor', planVersionId: 'other-version',
        x: 10, y: 10, type: 'ACCESS' }],
      connections: [], destinations: [{ id: 'saved-destination', nodeId: 'old-destination',
        type: 'SERVICE', name: 'Recepción', specialty: null }],
      walls: [wall, { ...wall, id: 'other-wall', floorId: 'other-floor', planVersionId: 'other-version' }],
      doors: [door]
    };
    const proposal: ModelProposal = { zones: [], warnings: [],
      nodes: [{ id: 'access', label: 'Acceso', role: 'ACCESS', x: 20, y: 50 },
        { id: 'destination', label: 'Destino', role: 'DESTINATION', x: 80, y: 50 }],
      connections: [{ id: 'route', fromNodeId: 'access', toNodeId: 'destination',
        distanceUnits: 60, graphType: 'DOORWAY' }],
      wallCandidates: [{ x1: 50, y1: 0, x2: 50, y2: 100 }],
      doors: [{ id: 'detected', x1: 50, y1: 45, x2: 50, y2: 55 }] };
    let sequence = 0;
    const editor = new GraphEditorState(() => `new-${++sequence}`);
    editor.load(original, [plan]); editor.floorId.set('floor');
    const preview = proposalGraphResult(proposal, plan, original).graph;
    expect(preview.connections[0].type).toBe('DOORWAY');
    expect(editor.applyGenerated(proposal, preview)).toBe(true);
    expect(editor.applyGenerated(proposal, preview)).toBe(true);
    expect(editor.graph().walls?.map(item => item.id)).toEqual(['saved-wall', 'other-wall']);
    expect(editor.graph().doors?.map(item => item.id)).toEqual(['saved-door']);
    expect(editor.graph().nodes.some(node => node.id === 'other')).toBe(true);
    expect(editor.graph().destinations.some(entry => entry.id === 'saved-destination')).toBe(true);
    expect(editor.graph().connections.filter(link => link.type === 'DOORWAY')).toHaveLength(1);
  });
});

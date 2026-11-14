import proposal from './piso2-proposal.fixture.json';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { previewPlan, proposalGraphResult, withGeneratedDestinations } from './proposal-graph';
import { validateGraph } from '../domain/model/graph-validation';
import { GraphEditorState } from './graph-editor-state';
import { crossingConflictDetails } from '../domain/model/map-geometry';
import { destinationReachability } from '../domain/model/graph-reachability';

describe('piso2.jpg generation regression', () => {
  it('passes preview and draft validation on the recognized plan', () => {
    const source = withGeneratedDestinations(proposal as ModelProposal);
    const plan = previewPlan(source, 'floor', 'version', {
      floorId: 'floor', planVersionId: 'version', widthUnits: 768, heightUnits: 576, metersPerUnit: 1
    });
    const result = proposalGraphResult(source, plan);
    const errors = validateGraph(result.graph, [plan]).filter(issue => issue.severity === 'error');
    const editor = new GraphEditorState();
    editor.load({ nodes: [], connections: [], destinations: [], walls: [], doors: [] }, [plan]);
    editor.floorId.set('floor');
    const accepted = new Map(result.graph.connections.map(link => [link.id, link]));
    expect(editor.applyGenerated({ ...source, connections: source.connections.flatMap(link => {
      const corrected = accepted.get(link.id);
      return corrected ? [{ ...link, graphType: corrected.type as 'CORRIDOR' | 'DOORWAY' }] : [];
    }) }, result.graph)).toBe(true);
    const savedErrors = validateGraph(editor.graph(), [plan]).filter(issue => issue.severity === 'error');
    expect(editor.graph().doors).toHaveLength(10);
    expect(destinationReachability(editor.graph())).toMatchObject({ total: 8, reachable: 8 });
    expect({ nodes: result.graph.nodes.length, links: result.graph.connections.length,
      walls: result.graph.walls?.length, doors: result.graph.doors?.length, warnings: result.warnings.length,
      errors: errors.length, codes: [...new Set(errors.map(issue => issue.code))],
      savedErrors: savedErrors.length, savedCodes: [...new Set(savedErrors.map(issue => issue.code))],
      crossingConflicts: crossingConflictDetails(editor.graph()).length,
      geometryError: editor.geometryError() }).toEqual({ nodes: 32, links: 33, walls: 159, doors: 10,
        warnings: 0, errors: 0, codes: [], savedErrors: 0, savedCodes: [], crossingConflicts: 0,
        geometryError: null });
  });
});

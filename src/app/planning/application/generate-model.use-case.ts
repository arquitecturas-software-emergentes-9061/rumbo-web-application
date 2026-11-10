import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { PlanInterpretation } from './floor-plan.contracts';
import { FLOOR_PLANS_PORT } from './planning.ports';
import { previewPlan, proposalGraph, unadoptedProposalGeometry } from './proposal-graph';
import { isEmptyProposal } from './proposal-review';

export type GeneratedModel =
  | { kind: 'preview-only'; interpretation: PlanInterpretation }
  | { kind: 'empty'; interpretation: PlanInterpretation }
  | { kind: 'candidate'; interpretation: PlanInterpretation; proposal: ModelProposal;
      plan: PlanBounds; graph: EditorGraph;
      unresolvedGeometry: Pick<ModelProposal, 'wallCandidates' | 'doors'> };

@Injectable({ providedIn: 'root' })
export class GenerateModelUseCase {
  private readonly plans = inject(FLOOR_PLANS_PORT);

  execute(siteId: string, floorId: string, versionId: string, currentPlan: PlanBounds | null) {
    return this.plans.interpret(siteId, floorId, versionId).pipe(map(interpretation => {
      const proposal = interpretation.proposal;
      if (interpretation.processing !== 'SVG_CANDIDATES' || !proposal)
        return { kind: 'preview-only', interpretation } as GeneratedModel;
      if (isEmptyProposal(proposal)) return { kind: 'empty', interpretation } as GeneratedModel;
      const plan = previewPlan(proposal, floorId, versionId, currentPlan);
      const graph = proposalGraph(proposal, plan);
      return { kind: 'candidate', interpretation, proposal, plan, graph,
        unresolvedGeometry: unadoptedProposalGeometry(proposal, graph) } as GeneratedModel;
    }));
  }
}

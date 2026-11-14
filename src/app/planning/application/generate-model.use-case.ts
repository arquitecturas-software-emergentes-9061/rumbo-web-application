import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ConnectionType, EditorGraph, PlanBounds } from '../domain/model/map-graph.types';
import { ModelProposal } from '../domain/model/plan-interpretation';
import { PlanInterpretation } from './floor-plan.contracts';
import { FLOOR_PLANS_PORT } from './planning.ports';
import { previewPlan, unadoptedProposalGeometry, withGeneratedDestinations } from './proposal-graph';
import { isEmptyProposal } from './proposal-review';
import { PlanReconciliationReview, reconcilePlanProposal } from './reconcile-plan-proposal';

export type GeneratedModel =
  | { kind: 'preview-only'; interpretation: PlanInterpretation }
  | { kind: 'empty'; interpretation: PlanInterpretation }
  | { kind: 'candidate'; interpretation: PlanInterpretation; proposal: ModelProposal;
      plan: PlanBounds; graph: EditorGraph;
      unresolvedGeometry: Pick<ModelProposal, 'wallCandidates' | 'doors'>;
      reconciliationReview: PlanReconciliationReview[]; requiresManualReview: boolean };

@Injectable({ providedIn: 'root' })
export class GenerateModelUseCase {
  private readonly plans = inject(FLOOR_PLANS_PORT);

  execute(siteId: string, floorId: string, versionId: string, currentPlan: PlanBounds | null,
          existing?: EditorGraph, previousProposal: ModelProposal | null = null) {
    return this.plans.interpret(siteId, floorId, versionId).pipe(map(interpretation => {
      const proposal = interpretation.proposal && withGeneratedDestinations(interpretation.proposal);
      if (interpretation.processing !== 'SVG_CANDIDATES' || !proposal)
        return { kind: 'preview-only', interpretation } as GeneratedModel;
      if (isEmptyProposal(proposal)) return { kind: 'empty', interpretation } as GeneratedModel;
      const plan = previewPlan(proposal, floorId, versionId, currentPlan);
      const constructionStarted = performance.now();
      const result = reconcilePlanProposal(previousProposal, proposal, existing, plan);
      const accepted = new Map(result.graph.connections.map(link => [link.id, link]));
      console.debug('[Generar modelo] construcción=' + (performance.now() - constructionStarted).toFixed(1) + 'ms');
      const reviewed = { ...result.proposal, connections: result.proposal.connections.flatMap(link => {
        const corrected = accepted.get(link.id);
        return corrected ? [{ ...link, graphType: corrected.type as ConnectionType,
          kind: corrected.type === 'CORRIDOR' ? 'CORRIDOR' : 'DOORWAY' }] : [];
      }),
        warnings: [...new Set([...result.proposal.warnings, ...result.warnings])] };
      return { kind: 'candidate', interpretation, proposal: reviewed, plan, graph: result.graph,
        unresolvedGeometry: unadoptedProposalGeometry(reviewed, result.graph),
        reconciliationReview: result.review, requiresManualReview: result.requiresManualReview } as GeneratedModel;
    }));
  }
}

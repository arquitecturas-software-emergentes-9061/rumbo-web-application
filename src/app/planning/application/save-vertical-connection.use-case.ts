import { Injectable, inject } from '@angular/core';
import { GraphConnection } from '../domain/model/map-graph.types';
import { validateVerticalConnection } from '../domain/model/vertical-connection';
import { DraftSnapshot } from './draft-graph.contracts';
import { DRAFT_GRAPH_PORT } from './planning.ports';

@Injectable({ providedIn: 'root' })
export class SaveVerticalConnectionUseCase {
  private readonly graphs = inject(DRAFT_GRAPH_PORT);

  execute(snapshot: DraftSnapshot, connection: GraphConnection) {
    validateVerticalConnection(snapshot.graph, connection);
    return this.graphs.save(snapshot, connection);
  }
}

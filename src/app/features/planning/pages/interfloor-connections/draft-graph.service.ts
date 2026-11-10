import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { GraphNode, GraphConnection } from '../../domain/model/map-graph.types';

export type { GraphNode, GraphConnection } from '../../domain/model/map-graph.types';

export type VerticalType = 'ELEVATOR' | 'STAIRS' | 'RAMP';
export type Accessibility = 'UNKNOWN' | 'ACCESSIBLE' | 'INACCESSIBLE';

export interface DraftGraph {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  status: 'DRAFT';
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: { id: string; nodeId: string; type: string; name: string; specialty: string | null }[];
}

export interface DraftSnapshot {
  graph: DraftGraph;
  etag: string;
}

@Injectable({ providedIn: 'root' })
export class DraftGraphService {
  private readonly http = inject(HttpClient);

  load(siteId: string) {
    return this.http.get<DraftGraph>(this.mapsUrl(siteId) + '/draft/graph', { observe: 'response' })
      .pipe(map(response => this.snapshot(response)));
  }

  save({ graph, etag }: DraftSnapshot, connection: GraphConnection) {
    const url = this.mapsUrl(graph.siteId) +
      `/${encodeURIComponent(graph.mapId)}/versions/${encodeURIComponent(graph.modelVersionId)}/graph`;
    const previous = graph.connections.findIndex(item => item.id === connection.id);
    const connections = previous < 0 ? [...graph.connections, connection] :
      graph.connections.map(item => item.id === connection.id ? connection : item);
    return this.http.put<DraftGraph>(url, { nodes: graph.nodes, connections, destinations: graph.destinations },
      { headers: { 'If-Match': etag }, observe: 'response' }).pipe(map(response => this.snapshot(response)));
  }

  private mapsUrl(siteId: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/maps`;
  }

  private snapshot(response: HttpResponse<DraftGraph>): DraftSnapshot {
    const graph = response.body;
    const etag = response.headers.get('ETag');
    if (!graph || graph.status !== 'DRAFT' || !etag) throw new Error('Incomplete draft graph response');
    return { graph, etag };
  }
}

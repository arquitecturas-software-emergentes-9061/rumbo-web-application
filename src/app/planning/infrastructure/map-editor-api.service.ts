import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GraphConnection, GraphNode, Destination, EditorGraph, PlanBounds, MapWall, MapDoor } from '../domain/model/map-graph.types';
import { DraftSnapshot, PublishedMapVersion } from '../application/map-editor.contracts';
import { MapEditorPort } from '../application/planning.ports';
export type { DraftSnapshot } from '../application/map-editor.contracts';

interface DraftResponse {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  status: string;
  plans: PlanBounds[];
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: Destination[];
  walls?: MapWall[];
  doors?: MapDoor[];
}

@Injectable({ providedIn: 'root' })
export class MapEditorApiService implements MapEditorPort {
  private readonly http = inject(HttpClient);

  /** Resolves to null when the site has no draft yet. */
  load(siteId: string) {
    return this.http.get<DraftResponse>(`${this.mapsUrl(siteId)}/draft/graph`, { observe: 'response' }).pipe(
      map(response => this.snapshot(response)),
      catchError((error: HttpErrorResponse) => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  /** Starts the site's first draft from stored floor plans; the API reads their size and confirmed scale. */
  createFirstDraft(siteId: string, plans: { floorId: string; planVersionId: string }[]) {
    return this.http.post<DraftResponse>(`${this.mapsUrl(siteId)}/draft`, { plans }, { observe: 'response' })
      .pipe(map(response => this.snapshot(response)));
  }

  save(snapshot: DraftSnapshot, graph: EditorGraph) {
    const url = `${this.mapsUrl(snapshot.siteId)}/${encodeURIComponent(snapshot.mapId)}/versions/${encodeURIComponent(snapshot.modelVersionId)}/graph`;
    const body = {
      nodes: graph.nodes, connections: graph.connections, walls: graph.walls ?? [], doors: graph.doors ?? [],
      destinations: graph.destinations.map(({ id, nodeId, type, name, specialty }) => ({ id, nodeId, type, name, specialty }))
    };
    return this.http.put<DraftResponse>(url, body, { headers: { 'If-Match': snapshot.etag }, observe: 'response' })
      .pipe(map(response => this.snapshot(response)));
  }

  private mapsUrl(siteId: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/maps`;
  }

  publish(snapshot: DraftSnapshot) {
    const url = `${this.mapsUrl(snapshot.siteId)}/${encodeURIComponent(snapshot.mapId)}/versions/${encodeURIComponent(snapshot.modelVersionId)}`;
    return this.http.patch<PublishedMapVersion>(url, { status: 'PUBLISHED' }, {
      headers: { 'Content-Type': 'application/merge-patch+json', 'If-Match': snapshot.etag }
    }).pipe(map(version => {
      if (version.status !== 'PUBLISHED' || version.modelVersionId !== snapshot.modelVersionId
          || version.siteId !== snapshot.siteId || version.mapId !== snapshot.mapId)
        throw new Error('Incomplete publication response');
      return version;
    }));
  }

  private snapshot(response: HttpResponse<DraftResponse>): DraftSnapshot {
    const body = response.body;
    const etag = response.headers.get('ETag');
    if (!body || body.status !== 'DRAFT' || !etag) throw new Error('Incomplete draft graph response');
    return {
      siteId: body.siteId, mapId: body.mapId, modelVersionId: body.modelVersionId, etag,
      plans: (body.plans ?? []).map(plan => ({ ...plan, metersPerUnit: plan.metersPerUnit ?? null })),
      graph: { nodes: body.nodes, connections: body.connections, destinations: body.destinations,
        walls: body.walls ?? [], doors: body.doors ?? [] }
    };
  }
}


import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { GraphConnection, GraphNode } from '../interfloor-connections/draft-graph.service';
import { Destination, EditorGraph, PlanBounds } from './graph-model';
import { GraphAlert, ServerIssue, fromServerIssues } from './graph-validation';

export interface DraftSnapshot {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  etag: string;
  plans: PlanBounds[];
  graph: EditorGraph;
}

interface DraftResponse {
  siteId: string;
  mapId: string;
  modelVersionId: string;
  status: string;
  plans: PlanBounds[];
  nodes: GraphNode[];
  connections: GraphConnection[];
  destinations: Destination[];
}

export type SaveFailureKind = 'stale' | 'not-draft' | 'invalid' | 'offline' | 'forbidden' | 'missing' | 'other';

export interface SaveFailure {
  kind: SaveFailureKind;
  message: string;
  issues: GraphAlert[];
}

@Injectable({ providedIn: 'root' })
export class MapEditorApiService {
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
      nodes: graph.nodes, connections: graph.connections,
      destinations: graph.destinations.map(({ id, nodeId, type, name, specialty }) => ({ id, nodeId, type, name, specialty }))
    };
    return this.http.put<DraftResponse>(url, body, { headers: { 'If-Match': snapshot.etag }, observe: 'response' })
      .pipe(map(response => this.snapshot(response)));
  }

  private mapsUrl(siteId: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/maps`;
  }

  private snapshot(response: HttpResponse<DraftResponse>): DraftSnapshot {
    const body = response.body;
    const etag = response.headers.get('ETag');
    if (!body || body.status !== 'DRAFT' || !etag) throw new Error('Incomplete draft graph response');
    return {
      siteId: body.siteId, mapId: body.mapId, modelVersionId: body.modelVersionId, etag,
      plans: (body.plans ?? []).map(plan => ({ ...plan, metersPerUnit: plan.metersPerUnit ?? null })),
      graph: { nodes: body.nodes, connections: body.connections, destinations: body.destinations }
    };
  }
}

export function classifySaveError(error: HttpErrorResponse): SaveFailure {
  const code: string | undefined = error.error?.code;
  const issues = fromServerIssues(error.error?.issues as ServerIssue[] | undefined);
  if (error.status === 412 || code === 'STALE_DRAFT_GRAPH') {
    return { kind: 'stale', issues, message: 'Otra persona modificó el borrador mientras lo editabas. Recarga la última versión; tus cambios locales no se guardaron.' };
  }
  if (error.status === 409) {
    return { kind: 'not-draft', issues, message: 'Este mapa ya no es un borrador (por ejemplo, ya se publicó). Recarga para ver el estado actual.' };
  }
  if (error.status === 422) {
    return { kind: 'invalid', issues, message: issues.length > 0 ? `El servidor rechazó el borrador por ${issues.length} problema${issues.length === 1 ? '' : 's'}. Revisa la pestaña Alertas.` : 'El servidor rechazó el borrador. Revisa los elementos del mapa.' };
  }
  if (error.status === 0) {
    return { kind: 'offline', issues, message: 'No hay conexión con la API. Tus cambios siguen en el editor; vuelve a intentar guardar.' };
  }
  if (error.status === 403) return { kind: 'forbidden', issues, message: 'Tu cuenta no tiene permiso para editar este mapa.' };
  if (error.status === 404) return { kind: 'missing', issues, message: 'El borrador ya no existe para esta sede.' };
  return { kind: 'other', issues, message: 'No se pudo guardar el borrador. Intenta de nuevo.' };
}

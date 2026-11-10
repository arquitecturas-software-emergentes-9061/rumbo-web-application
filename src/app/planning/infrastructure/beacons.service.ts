import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Beacon, FloorPlanBounds, SaveBeaconRequest } from '../domain/model/beacon.model';
import { BeaconsPort } from '../application/planning.ports';

@Injectable({ providedIn: 'root' })
export class BeaconsService implements BeaconsPort {
  private readonly http = inject(HttpClient);

  load(siteId: string) {
    return this.http.get<Beacon[]>(this.beaconsUrl(siteId));
  }

  register(siteId: string, request: SaveBeaconRequest) {
    return this.http.post<Beacon>(this.beaconsUrl(siteId), request);
  }

  update(siteId: string, beaconId: string, request: SaveBeaconRequest) {
    return this.http.put<Beacon>(this.beaconsUrl(siteId) + '/' + encodeURIComponent(beaconId), request);
  }

  setActive(siteId: string, beaconId: string, active: boolean) {
    return this.http.patch<Beacon>(this.beaconsUrl(siteId) + '/' + encodeURIComponent(beaconId) + '/status', { active });
  }

  /** Plan bounds per floor come from the current draft; a site without a draft has none. */
  loadPlanBounds(siteId: string) {
    const url = `${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/maps/draft/graph`;
    return this.http.get<{ plans?: FloorPlanBounds[] }>(url).pipe(
      map(graph => (graph.plans ?? []).map(({ floorId, widthUnits, heightUnits }) => ({ floorId, widthUnits, heightUnits }))),
      catchError(error => error.status === 404 ? of([] as FloorPlanBounds[]) : throwError(() => error))
    );
  }

  private beaconsUrl(siteId: string): string {
    return environment.apiUrl + '/sites/' + encodeURIComponent(siteId) + '/beacons';
  }
}

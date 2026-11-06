import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../../environments/environment';

export interface RegisterBeacon {
  floorId: string;
  identifier: string;
  x: number;
  y: number;
}

export interface Beacon extends RegisterBeacon {
  id: string;
  siteId: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class BeaconInventoryService {
  private readonly http = inject(HttpClient);

  list(siteId: string, floorId: string) {
    return this.http.get<Beacon[]>(this.url(siteId), { params: floorId ? { floorId } : {} });
  }

  register(siteId: string, input: RegisterBeacon) {
    return this.http.post<Beacon>(this.url(siteId), input);
  }

  setActive(siteId: string, id: string, active: boolean) {
    return this.http.patch<Beacon>(`${this.url(siteId)}/${encodeURIComponent(id)}/status`, { active });
  }

  private url(siteId: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/beacons`;
  }
}

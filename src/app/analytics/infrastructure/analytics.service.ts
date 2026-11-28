import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AnalyticsPort } from '../application/analytics.ports';
import { NavigationHeatmap, PublishedSite, SiteModel } from '../domain/model/heatmap.model';

@Injectable({ providedIn: 'root' })
export class AnalyticsService implements AnalyticsPort {
  private readonly http = inject(HttpClient);

  listSites() {
    return this.http.get<PublishedSite[]>(`${environment.apiUrl}/published-sites`);
  }

  loadModel(siteId: string) {
    return this.http.get<SiteModel>(`${environment.apiUrl}/sites/${encodeURIComponent(siteId)}/published-map`).pipe(
      map(model => ({
        siteId: model.siteId, plans: model.plans ?? [], floors: model.floors ?? [], nodes: model.nodes ?? [],
        destinations: model.destinations ?? [], walls: model.walls ?? [], doors: model.doors ?? []
      })),
      catchError(error => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  loadHeatmap(siteId: string, from: string, to: string) {
    const params = new HttpParams().set('siteId', siteId).set('from', from).set('to', to);
    return this.http.get<NavigationHeatmap>(`${environment.apiUrl}/analytics/navigation-heatmap`, { params });
  }
}

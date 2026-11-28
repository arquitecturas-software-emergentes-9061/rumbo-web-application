import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { NavigationHeatmap, PublishedSite, SiteModel } from '../domain/model/heatmap.model';

export interface AnalyticsPort {
  /** Sites of the administrator that have an official map. */
  listSites(): Observable<PublishedSite[]>;
  /** Official model of a site; null when it has no published map. */
  loadModel(siteId: string): Observable<SiteModel | null>;
  loadHeatmap(siteId: string, from: string, to: string): Observable<NavigationHeatmap>;
}
export const ANALYTICS_PORT = new InjectionToken<AnalyticsPort>('Analytics heatmap');

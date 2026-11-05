import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClinicOrganization, ClinicProfile, CreateFloorRequest, CreateSiteRequest, Floor, Site } from '../models/site-floor.model';

@Injectable({ providedIn: 'root' })
export class SitesService {
  private readonly http = inject(HttpClient);
  private readonly sitesUrl = environment.apiUrl + '/sites';
  private readonly clinicUrl = environment.apiUrl + '/clinics/me';

  loadSites() {
    return this.http.get<Site[]>(this.sitesUrl);
  }

  createSite(request: CreateSiteRequest) {
    return this.http.post<Site>(this.sitesUrl, request);
  }

  updateSite(siteId: string, request: CreateSiteRequest) {
    return this.http.put<Site>(this.sitesUrl + '/' + encodeURIComponent(siteId), request);
  }

  loadFloors(siteId: string) {
    return this.http.get<Floor[]>(this.floorsUrl(siteId));
  }

  createFloor(siteId: string, request: CreateFloorRequest) {
    return this.http.post<Floor>(this.floorsUrl(siteId), request);
  }

  getOrganization() {
    return this.http.get<ClinicOrganization>(this.clinicUrl).pipe(
      catchError(error => error.status === 404 ? of(null) : throwError(() => error))
    );
  }

  saveOrganization(profile: ClinicProfile) {
    return this.http.put<ClinicOrganization>(this.clinicUrl, profile);
  }

  private floorsUrl(siteId: string): string {
    return this.sitesUrl + '/' + encodeURIComponent(siteId) + '/floors';
  }
}

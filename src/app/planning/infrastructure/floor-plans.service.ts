import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Calibration, CalibrationInput, PlanInterpretation, PlanVersion } from '../application/floor-plan.contracts';
import { FloorPlansPort } from '../application/planning.ports';

export type { Point, PlanPolygon, ModelZone, ModelBarrier } from '../domain/model/plan-interpretation';
export type { Calibration, CalibrationInput, PlanInterpretation, PlanVersion } from '../application/floor-plan.contracts';

@Injectable({ providedIn: 'root' })
export class FloorPlansService implements FloorPlansPort {
  private readonly http = inject(HttpClient);

  list(site: string, floor: string) {
    return this.http.get<PlanVersion[]>(this.plans(site, floor));
  }

  upload(site: string, floor: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<PlanVersion>(this.plans(site, floor), body);
  }

  original(site: string, floor: string, id: string) {
    return this.http.get(`${this.plans(site, floor)}/versions/${encodeURIComponent(id)}`, {
      responseType: 'blob', observe: 'response'
    });
  }

  interpret(site: string, floor: string, id: string) {
    return this.http.post<PlanInterpretation>(
      `${this.plans(site, floor)}/versions/${encodeURIComponent(id)}/interpretation`, null);
  }

  calibration(site: string, id: string) {
    return this.http.get<Calibration>(this.calibrationUrl(site, id)).pipe(
      catchError((error: HttpErrorResponse) => error.status === 404 && error.error?.code === 'CALIBRATION_NOT_FOUND'
        ? of(null)
        : throwError(() => error))
    );
  }

  save(site: string, id: string, input: CalibrationInput) {
    return this.http.put<Calibration>(this.calibrationUrl(site, id), input);
  }

  private plans(site: string, floor: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(site)}/floors/${encodeURIComponent(floor)}/plans`;
  }

  private calibrationUrl(site: string, id: string) {
    return `${environment.apiUrl}/sites/${encodeURIComponent(site)}/plan-calibrations/${encodeURIComponent(id)}`;
  }
}

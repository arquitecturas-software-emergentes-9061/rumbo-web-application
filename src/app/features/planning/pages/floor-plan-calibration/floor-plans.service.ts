import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { ModelProposal } from '../../domain/model/plan-interpretation';

export type { Point, PlanPolygon, ModelZone, ModelBarrier } from '../../domain/model/plan-interpretation';

export interface PlanVersion {
  id: string;
  version: number;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CalibrationInput {
  floorId: string;
  unit: 'METERS' | 'CENTIMETERS';
  measuredDistance: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface Calibration extends CalibrationInput {
  planVersionId: string;
  metersPerUnit: number;
}

export interface PlanInterpretation {
  versionId: string;
  floorId: string;
  mediaType: string;
  processing: 'SVG_CANDIDATES' | 'PREVIEW_ONLY';
  scaleStatus: 'PROVISIONAL' | 'CONFIRMED';
  metersPerUnit: number | null;
  proposal: ModelProposal | null;
}

@Injectable({ providedIn: 'root' })
export class FloorPlansService {
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

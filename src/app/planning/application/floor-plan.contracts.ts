import { ModelProposal } from '../domain/model/plan-interpretation';

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

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Beacon, FloorPlanBounds, SaveBeaconRequest } from '../domain/model/beacon.model';
import { ClinicOrganization, ClinicProfile, CreateFloorRequest, CreateSiteRequest, Floor, Site } from '../domain/model/site-floor.model';
import { EditorGraph, GraphConnection } from '../domain/model/map-graph.types';
import { Calibration, CalibrationInput, PlanInterpretation, PlanVersion } from './floor-plan.contracts';
import { DraftSnapshot as InterfloorSnapshot } from './draft-graph.contracts';
import { DraftSnapshot as EditorSnapshot } from './map-editor.contracts';

/** Application-facing operations. HTTP details and endpoint paths belong to infrastructure. */
export interface SitesPort {
  loadSites(): Observable<Site[]>;
  createSite(request: CreateSiteRequest): Observable<Site>;
  updateSite(siteId: string, request: CreateSiteRequest): Observable<Site>;
  loadFloors(siteId: string): Observable<Floor[]>;
  createFloor(siteId: string, request: CreateFloorRequest): Observable<Floor>;
  getOrganization(): Observable<ClinicOrganization | null>;
  saveOrganization(profile: ClinicProfile): Observable<ClinicOrganization>;
}
export const SITES_PORT = new InjectionToken<SitesPort>('Planning sites');

export interface BeaconsPort {
  load(siteId: string): Observable<Beacon[]>;
  register(siteId: string, request: SaveBeaconRequest): Observable<Beacon>;
  update(siteId: string, beaconId: string, request: SaveBeaconRequest): Observable<Beacon>;
  setActive(siteId: string, beaconId: string, active: boolean): Observable<Beacon>;
  loadPlanBounds(siteId: string): Observable<FloorPlanBounds[]>;
}
export const BEACONS_PORT = new InjectionToken<BeaconsPort>('Planning beacons');

export interface PlanFileResponse {
  body: Blob | null;
  headers: { get(name: string): string | null };
}
export interface FloorPlansPort {
  list(siteId: string, floorId: string): Observable<PlanVersion[]>;
  upload(siteId: string, floorId: string, file: File): Observable<PlanVersion>;
  original(siteId: string, floorId: string, versionId: string): Observable<PlanFileResponse>;
  interpret(siteId: string, floorId: string, versionId: string): Observable<PlanInterpretation>;
  calibration(siteId: string, versionId: string): Observable<Calibration | null>;
  save(siteId: string, versionId: string, input: CalibrationInput): Observable<Calibration>;
}
export const FLOOR_PLANS_PORT = new InjectionToken<FloorPlansPort>('Planning floor plans');

export interface DraftGraphPort {
  load(siteId: string): Observable<InterfloorSnapshot>;
  save(snapshot: InterfloorSnapshot, connection: GraphConnection): Observable<InterfloorSnapshot>;
}
export const DRAFT_GRAPH_PORT = new InjectionToken<DraftGraphPort>('Planning draft graph');

export interface MapEditorPort {
  load(siteId: string): Observable<EditorSnapshot | null>;
  createFirstDraft(siteId: string, plans: { floorId: string; planVersionId: string }[]): Observable<EditorSnapshot>;
  save(snapshot: EditorSnapshot, graph: EditorGraph): Observable<EditorSnapshot>;
}
export const MAP_EDITOR_PORT = new InjectionToken<MapEditorPort>('Planning map editor');

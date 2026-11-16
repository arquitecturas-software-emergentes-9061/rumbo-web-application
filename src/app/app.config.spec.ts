import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { AUTH_GATEWAY_PORT, AUTH_PORT, AUTH_STORAGE_PORT, PASSWORD_RECOVERY_PORT } from './iam/application/iam.ports';
import { AuthService } from './iam/application/auth.service';
import { AuthHttpGateway } from './iam/infrastructure/auth-http.gateway';
import { BrowserAuthStorage } from './iam/infrastructure/browser-auth.storage';
import { PasswordRecoveryService } from './iam/infrastructure/password-recovery.service';
import { BEACONS_PORT, DRAFT_GRAPH_PORT, FLOOR_PLANS_PORT, MAP_EDITOR_PORT, SITES_PORT } from './planning/application/planning.ports';
import { GenerateModelUseCase } from './planning/application/generate-model.use-case';
import { BeaconsService } from './planning/infrastructure/beacons.service';
import { DraftGraphService } from './planning/infrastructure/draft-graph.service';
import { FloorPlansService } from './planning/infrastructure/floor-plans.service';
import { MapEditorApiService } from './planning/infrastructure/map-editor-api.service';
import { SitesService } from './planning/infrastructure/sites.service';

describe('application port bindings', () => {
  it('connects IAM and Planning use cases to their existing adapters', () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    expect(TestBed.inject(AUTH_PORT)).toBe(TestBed.inject(AuthService));
    expect(TestBed.inject(AUTH_GATEWAY_PORT)).toBe(TestBed.inject(AuthHttpGateway));
    expect(TestBed.inject(AUTH_STORAGE_PORT)).toBe(TestBed.inject(BrowserAuthStorage));
    expect(TestBed.inject(PASSWORD_RECOVERY_PORT)).toBe(TestBed.inject(PasswordRecoveryService));
    expect(TestBed.inject(SITES_PORT)).toBe(TestBed.inject(SitesService));
    expect(TestBed.inject(BEACONS_PORT)).toBe(TestBed.inject(BeaconsService));
    expect(TestBed.inject(FLOOR_PLANS_PORT)).toBe(TestBed.inject(FloorPlansService));
    expect(TestBed.inject(DRAFT_GRAPH_PORT)).toBe(TestBed.inject(DraftGraphService));
    expect(TestBed.inject(MAP_EDITOR_PORT)).toBe(TestBed.inject(MapEditorApiService));
    expect(TestBed.inject(GenerateModelUseCase)).toBeTruthy();
  });
});

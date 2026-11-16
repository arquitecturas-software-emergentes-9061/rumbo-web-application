import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './iam/infrastructure/interceptors/auth.interceptor';
import { subscriptionRestrictionInterceptor } from './subscriptions/infrastructure/interceptors/subscription-restriction.interceptor';
import { AUTH_GATEWAY_PORT, AUTH_PORT, AUTH_STORAGE_PORT, PASSWORD_RECOVERY_PORT } from './iam/application/iam.ports';
import { AuthService } from './iam/application/auth.service';
import { AuthHttpGateway } from './iam/infrastructure/auth-http.gateway';
import { BrowserAuthStorage } from './iam/infrastructure/browser-auth.storage';
import { PasswordRecoveryService } from './iam/infrastructure/password-recovery.service';
import { BEACONS_PORT, DRAFT_GRAPH_PORT, FLOOR_PLANS_PORT, MAP_EDITOR_PORT, SITES_PORT } from './planning/application/planning.ports';
import { BeaconsService } from './planning/infrastructure/beacons.service';
import { DraftGraphService } from './planning/infrastructure/draft-graph.service';
import { FloorPlansService } from './planning/infrastructure/floor-plans.service';
import { MapEditorApiService } from './planning/infrastructure/map-editor-api.service';
import { SitesService } from './planning/infrastructure/sites.service';
import { BROWSER_NAVIGATION, SUBSCRIPTIONS_PORT } from './subscriptions/application/subscriptions.ports';
import { BrowserNavigationService } from './subscriptions/infrastructure/browser-navigation.service';
import { SubscriptionsService } from './subscriptions/infrastructure/subscriptions.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, subscriptionRestrictionInterceptor])),
    { provide: AUTH_PORT, useExisting: AuthService },
    { provide: AUTH_GATEWAY_PORT, useExisting: AuthHttpGateway },
    { provide: AUTH_STORAGE_PORT, useExisting: BrowserAuthStorage },
    { provide: PASSWORD_RECOVERY_PORT, useExisting: PasswordRecoveryService },
    { provide: SITES_PORT, useExisting: SitesService },
    { provide: BEACONS_PORT, useExisting: BeaconsService },
    { provide: FLOOR_PLANS_PORT, useExisting: FloorPlansService },
    { provide: DRAFT_GRAPH_PORT, useExisting: DraftGraphService },
    { provide: MAP_EDITOR_PORT, useExisting: MapEditorApiService },
    { provide: SUBSCRIPTIONS_PORT, useExisting: SubscriptionsService },
    { provide: BROWSER_NAVIGATION, useExisting: BrowserNavigationService }
  ],
};

import { Routes } from '@angular/router';
import { LoginComponent } from './iam/presentation/pages/login/login.component';
import { DashboardComponent } from './shared/presentation/pages/dashboard/dashboard.component';
import { authGuard, publicGuard } from './iam/infrastructure/guards/auth.guard';
import { SignUpComponent } from './iam/presentation/pages/sign-up/sign-up.component';
import { PasswordRecoveryRequestComponent } from './iam/presentation/pages/password-recovery-request/password-recovery-request.component';
import { PasswordResetConfirmComponent } from './iam/presentation/pages/password-reset-confirm/password-reset-confirm.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'admin'
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'registro',
    component: SignUpComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'recuperar-clave',
    component: PasswordRecoveryRequestComponent
  },
  {
    path: 'restablecer-clave',
    component: PasswordResetConfirmComponent
  },
  {
    path: 'admin',
    component: DashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: 'planning/sites',
    loadComponent: () => import('./planning/presentation/pages/sites-management/sites-management.component')
      .then(module => module.SitesManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/maps',
    loadComponent: () => import('./planning/presentation/pages/floor-plan-calibration/floor-plan-calibration.component')
      .then(module => module.FloorPlanCalibrationComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/interfloor-connections',
    loadComponent: () => import('./planning/presentation/pages/interfloor-connections/interfloor-connections.component')
      .then(module => module.InterfloorConnectionsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/beacons',
    loadComponent: () => import('./planning/presentation/pages/beacons-management/beacons-management.component')
      .then(module => module.BeaconsManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/map-editor',
    loadComponent: () => import('./planning/presentation/pages/map-editor/map-editor.component')
      .then(module => module.MapEditorComponent),
    canActivate: [authGuard]
  },
  {
    path: 'subscriptions/me',
    loadComponent: () => import('./subscriptions/presentation/pages/my-subscription/my-subscription.component')
      .then(module => module.MySubscriptionComponent),
    canActivate: [authGuard]
  },
  {
    path: 'subscriptions/plans',
    loadComponent: () => import('./subscriptions/presentation/pages/plans/plans.component')
      .then(module => module.PlansComponent),
    canActivate: [authGuard]
  },
  {
    path: 'subscriptions/payment-result',
    loadComponent: () => import('./subscriptions/presentation/pages/payment-result/payment-result.component')
      .then(module => module.PaymentResultComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: 'admin'
  }
];

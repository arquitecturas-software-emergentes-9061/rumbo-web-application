import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/pages/login/login.component';
import { DashboardComponent } from './features/dashboard/pages/dashboard/dashboard.component';
import { authGuard, publicGuard } from './core/guards/auth.guard';
import { PasswordRecoveryRequestComponent } from './features/auth/pages/password-recovery-request/password-recovery-request.component';
import { PasswordResetConfirmComponent } from './features/auth/pages/password-reset-confirm/password-reset-confirm.component';

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
    loadComponent: () => import('./features/planning/pages/sites-management/sites-management.component')
      .then(module => module.SitesManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/maps',
    loadComponent: () => import('./features/planning/pages/floor-plan-calibration/floor-plan-calibration.component')
      .then(module => module.FloorPlanCalibrationComponent),
    canActivate: [authGuard]
  },
  {
    path: 'planning/interfloor-connections',
    loadComponent: () => import('./features/planning/pages/interfloor-connections/interfloor-connections.component')
      .then(module => module.InterfloorConnectionsComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: 'admin'
  }
];

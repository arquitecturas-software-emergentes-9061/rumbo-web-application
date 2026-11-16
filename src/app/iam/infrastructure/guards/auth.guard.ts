import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../application/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.validateSession().pipe(map(valid => valid || router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  })));
};

export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.validateSession().pipe(map(valid => valid ? router.createUrlTree(['/admin']) : true));
};

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../application/auth.service';
import { IamAccessError } from '../../application/iam-access.error';
import { environment } from '../../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl;
  // Credentials are confined to our API, excluding public IAM operations.
  if (!(req.url === base || req.url.startsWith(`${base}/`)) ||
      req.url.startsWith(`${base}/auth/`) || req.url.startsWith(`${base}/password-recovery/`)) return next(req);
  const auth = inject(AuthService);
  return auth.getValidAccessToken().pipe(catchError(error => {
    if ((error instanceof HttpErrorResponse || error instanceof IamAccessError) && error.status === 401) auth.expireSession();
    return throwError(() => error);
  }), switchMap(token => {
    const authorized = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
    return next(authorized).pipe(catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !token) return throwError(() => error);
      return auth.recoverAccessToken(token).pipe(
        switchMap(fresh => next(req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } }))),
        catchError(retryError => {
          if ((retryError instanceof HttpErrorResponse || retryError instanceof IamAccessError)
              && retryError.status === 401) auth.expireSession();
          return throwError(() => retryError);
        })
      );
    }));
  }));
};

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { restrictionFrom } from '../../domain/model/subscription-restriction.model';
import { SubscriptionRestrictionStore } from '../../application/subscription-restriction.store';

/**
 * Turns plan restrictions answered by the API into a visible notice (WI-US23-03, PR-99). The error is passed on
 * unchanged and the request is never retried, so each page still handles its own failure state.
 */
export const subscriptionRestrictionInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(SubscriptionRestrictionStore);
  return next(req).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse) {
      const restriction = restrictionFrom(error.status, error.error, req.url);
      if (restriction) store.report(restriction);
    }
    return throwError(() => error);
  }));
};

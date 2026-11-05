import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { authGuard, publicGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('IAM guards', () => {
  const auth = { validateSession: vi.fn() };
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] }));
  it('awaits the backend validation before allowing an admin route', async () => {
    auth.validateSession.mockReturnValue(of(true));
    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url: '/planning/sites' } as RouterStateSnapshot));
    expect(await firstValueFrom(result as Observable<boolean>)).toBe(true);
    expect(auth.validateSession).toHaveBeenCalled();
  });
  it('redirects rejected sessions to login preserving the internal destination', async () => {
    auth.validateSession.mockReturnValue(of(false));
    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url: '/planning/sites' } as RouterStateSnapshot));
    expect((await firstValueFrom(result as Observable<UrlTree>)).toString()).toContain('/login?returnUrl=%2Fplanning%2Fsites');
  });
  it('redirects a verified session from login to admin', async () => {
    auth.validateSession.mockReturnValue(of(true));
    const result = TestBed.runInInjectionContext(() => publicGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect((await firstValueFrom(result as Observable<UrlTree>)).toString()).toBe('/admin');
  });
});

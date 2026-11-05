import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../../core/services/auth.service';
import { AuthenticatedUserResponse } from '../../../../core/models/auth.model';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: { signIn: ReturnType<typeof vi.fn> };
  let router: Router;

  const mockResponse: AuthenticatedUserResponse = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'CLINIC_ADMIN',
    clinicId: null,
    tokenType: 'Bearer',
    accessToken: 'test-token',
    expiresIn: 900,
    refreshToken: 'test-refresh',
    refreshTokenExpiresAt: '2026-11-12T19:30:00Z'
  };

  beforeEach(async () => {
    authServiceSpy = { signIn: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create the component with empty invalid form', () => {
    expect(component).toBeTruthy();
    expect(component.loginForm.valid).toBe(false);
    expect(component.emailControl?.value).toBe('');
    expect(component.passwordControl?.value).toBe('');
  });

  it('should validate email format and password min length', () => {
    component.loginForm.setValue({ email: 'invalid-email', password: '123' });
    expect(component.emailControl?.hasError('email')).toBe(true);
    expect(component.passwordControl?.hasError('minlength')).toBe(true);
    expect(component.loginForm.valid).toBe(false);

    component.loginForm.setValue({ email: 'admin@clinica.com', password: 'Password123!' });
    expect(component.loginForm.valid).toBe(true);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(false);
  });

  it('should submit valid credentials and redirect to /admin', () => {
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');
    authServiceSpy.signIn.mockReturnValue(of(mockResponse));

    component.loginForm.setValue({ email: 'admin@clinica.com', password: 'Password123!' });
    component.onSubmit();

    expect(authServiceSpy.signIn).toHaveBeenCalledWith({
      email: 'admin@clinica.com',
      password: 'Password123!'
    });
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/admin');
    expect(component.errorMessage()).toBeNull();
  });

  it('should display error message on 401 invalid credentials', () => {
    const errorResponse = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      error: {
        code: 'INVALID_CREDENTIALS',
        title: 'Unauthorized',
        detail: 'Invalid email or password'
      }
    });

    authServiceSpy.signIn.mockReturnValue(throwError(() => errorResponse));

    component.loginForm.setValue({ email: 'wrong@clinica.com', password: 'WrongPassword123!' });
    component.onSubmit();

    expect(component.errorMessage()).toContain('Credenciales inválidas');
    expect(component.isLoading()).toBe(false);
  });

  it('should display connection error message when server is unreachable', () => {
    const connectionError = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
    authServiceSpy.signIn.mockReturnValue(throwError(() => connectionError));

    component.loginForm.setValue({ email: 'admin@clinica.com', password: 'Password123!' });
    component.onSubmit();

    expect(component.errorMessage()).toContain('No se pudo conectar con el servidor');
  });
});

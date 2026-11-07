import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SignUpComponent } from './sign-up.component';
import { AuthService } from '../../../../core/services/auth.service';

describe('SignUpComponent', () => {
  let component: SignUpComponent;
  let fixture: ComponentFixture<SignUpComponent>;
  let authServiceSpy: { signUp: ReturnType<typeof vi.fn> };
  let router: Router;

  const valid = {
    fullName: ' María López ',
    email: 'maria@clinica.pe',
    password: 'Rumbo2026',
    clinicName: 'Clínica Ejemplo',
    acceptedTerms: true
  };

  beforeEach(async () => {
    authServiceSpy = { signUp: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SignUpComponent],
      providers: [{ provide: AuthService, useValue: authServiceSpy }, provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(SignUpComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('starts invalid and blocks submit', () => {
    expect(component.signUpForm.valid).toBe(false);
    component.onSubmit();
    expect(authServiceSpy.signUp).not.toHaveBeenCalled();
    expect(component.fullNameControl?.touched).toBe(true);
  });

  it('enforces the password policy (8+ chars, uppercase, number)', () => {
    const control = component.passwordControl!;
    for (const weak of ['short1A', 'alllowercase1', 'NoDigitsHere']) {
      control.setValue(weak);
      expect(control.valid).toBe(false);
    }
    control.setValue('Rumbo2026');
    expect(control.valid).toBe(true);
    expect(component.hasMinLength && component.hasUppercase && component.hasNumber).toBe(true);
  });

  it('requires the terms to be accepted', () => {
    component.signUpForm.setValue({ ...valid, acceptedTerms: false });
    expect(component.signUpForm.valid).toBe(false);
  });

  it('sends a CLINIC_ADMIN sign-up with trimmed values and goes to login', () => {
    authServiceSpy.signUp.mockReturnValue(of({ id: '1', email: valid.email, role: 'CLINIC_ADMIN', status: 'ACTIVE', clinicId: null }));
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.signUpForm.setValue(valid);
    component.onSubmit();
    expect(authServiceSpy.signUp).toHaveBeenCalledWith({
      role: 'CLINIC_ADMIN',
      fullName: 'María López',
      email: 'maria@clinica.pe',
      password: 'Rumbo2026',
      clinicName: 'Clínica Ejemplo',
      acceptedTerms: true
    });
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'account-created' } });
  });

  it('flags an already registered email on the field', () => {
    authServiceSpy.signUp.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { code: 'EMAIL_ALREADY_REGISTERED' }
    })));
    component.signUpForm.setValue(valid);
    component.onSubmit();
    fixture.detectChanges();
    expect(component.emailTaken()).toBe(true);
    expect(component.isLoading()).toBe(false);
    expect(fixture.nativeElement.querySelector('#email-taken')).toBeTruthy();
  });

  it('explains a connection failure', () => {
    authServiceSpy.signUp.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.signUpForm.setValue(valid);
    component.onSubmit();
    expect(component.errorMessage()).toContain('No se pudo conectar');
  });

  it('maps a weak password rejected by the server', () => {
    authServiceSpy.signUp.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { code: 'WEAK_PASSWORD' }
    })));
    component.signUpForm.setValue(valid);
    component.onSubmit();
    expect(component.errorMessage()).toContain('requisitos de seguridad');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PasswordRecoveryRequestComponent } from './password-recovery-request.component';
import { PasswordRecoveryService } from '../../../../core/services/password-recovery.service';

describe('PasswordRecoveryRequestComponent', () => {
  let component: PasswordRecoveryRequestComponent;
  let fixture: ComponentFixture<PasswordRecoveryRequestComponent>;
  let recoveryServiceSpy: { requestPasswordReset: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    recoveryServiceSpy = { requestPasswordReset: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [PasswordRecoveryRequestComponent],
      providers: [
        { provide: PasswordRecoveryService, useValue: recoveryServiceSpy },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordRecoveryRequestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component with invalid initial form', () => {
    expect(component).toBeTruthy();
    expect(component.requestForm.valid).toBe(false);
    expect(component.isSubmitted()).toBe(false);
  });

  it('should validate email format and requirement', () => {
    component.requestForm.setValue({ email: '' });
    expect(component.emailControl?.hasError('required')).toBe(true);

    component.requestForm.setValue({ email: 'not-an-email' });
    expect(component.emailControl?.hasError('email')).toBe(true);

    component.requestForm.setValue({ email: 'admin@clinica.com' });
    expect(component.requestForm.valid).toBe(true);
  });

  it('should submit request and show neutral success state upon 202 response', () => {
    recoveryServiceSpy.requestPasswordReset.mockReturnValue(of(undefined));

    component.requestForm.setValue({ email: 'admin@clinica.com' });
    component.onSubmit();

    expect(recoveryServiceSpy.requestPasswordReset).toHaveBeenCalledWith('admin@clinica.com');
    expect(component.isSubmitted()).toBe(true);
    expect(component.submittedEmail()).toBe('admin@clinica.com');
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('should display error message when request fails due to server error', () => {
    const errorResponse = new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' });
    recoveryServiceSpy.requestPasswordReset.mockReturnValue(throwError(() => errorResponse));

    component.requestForm.setValue({ email: 'admin@clinica.com' });
    component.onSubmit();

    expect(component.isSubmitted()).toBe(false);
    expect(component.errorMessage()).toContain('Ocurrió un error al procesar la solicitud');
    expect(component.isLoading()).toBe(false);
  });

  it('should reset state when retry is called', () => {
    component.isSubmitted.set(true);
    component.errorMessage.set('Some error');

    component.retry();

    expect(component.isSubmitted()).toBe(false);
    expect(component.errorMessage()).toBeNull();
    expect(component.requestForm.value.email).toBeNull();
  });
});

import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ValidatorFn, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, catchError, finalize, forkJoin, of, switchMap } from 'rxjs';
import { SitesService } from '../../../../core/services/sites.service';
import { ClinicOrganization, Floor, Site } from '../../../../core/models/site-floor.model';
import { AdminShellComponent } from '../../../../shared/admin-shell/admin-shell.component';

const trimmedLength = (minimum: number): ValidatorFn => control =>
  typeof control.value === 'string' && control.value.trim().length >= minimum ? null : { required: true };

@Component({
  selector: 'app-sites-management',
  imports: [ReactiveFormsModule, RouterLink, AdminShellComponent],
  templateUrl: './sites-management.component.html',
  styleUrl: './sites-management.component.css'
})
export class SitesManagementComponent implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly service = inject(SitesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly floorSelection = new Subject<string | null>();

  readonly organization = signal<ClinicOrganization | null>(null);
  readonly sites = signal<Site[]>([]);
  readonly selectedSiteId = signal<string | null>(null);
  readonly selectedSite = computed(() => this.sites().find(site => site.id === this.selectedSiteId()) ?? null);
  readonly floors = signal<Floor[]>([]);
  readonly loading = signal(true);
  readonly floorsLoading = signal(false);
  readonly loadFailed = signal(false);
  readonly floorError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly editor = signal<'clinic' | 'site' | 'floor' | null>(null);
  readonly editingSiteId = signal<string | null>(null);
  readonly duplicateAddress = signal(false);

  readonly siteForm = this.fb.group({
    name: ['', [trimmedLength(2), Validators.maxLength(120)]],
    address: ['', [trimmedLength(1), Validators.maxLength(200)]]
  });
  readonly floorForm = this.fb.group({
    number: this.fb.control<number | null>(0, [Validators.required, Validators.min(-2147483648),
      Validators.max(2147483647), control => Number.isInteger(control.value) ? null : { integer: true }]),
    name: ['', [trimmedLength(2), Validators.maxLength(100)]],
    description: ['', Validators.maxLength(250)]
  });
  readonly clinicForm = this.fb.group({
    name: ['', [trimmedLength(1), Validators.maxLength(160)]],
    code: ['', [trimmedLength(1), Validators.maxLength(60)]],
    contactEmail: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', Validators.maxLength(40)]
  });

  ngOnInit(): void {
    this.floorSelection.pipe(
      switchMap(id => {
        this.floorError.set(null);
        this.floors.set([]);
        this.floorsLoading.set(id !== null);
        if (!id) return of([]);
        return this.service.loadFloors(id).pipe(
          catchError(error => {
            this.floorError.set(this.message(error, 'No se pudieron cargar los pisos.'));
            return of([]);
          }),
          finalize(() => this.floorsLoading.set(false))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(floors => this.floors.set(floors));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    forkJoin({ clinic: this.service.getOrganization(), sites: this.service.loadSites() }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ clinic, sites }) => {
        this.organization.set(clinic);
        this.sites.set(sites);
        const current = sites.find(site => site.id === this.selectedSiteId());
        this.selectSite(current?.id ?? sites[0]?.id ?? null);
      },
      error: error => {
        this.loadFailed.set(true);
        this.error.set(this.message(error, 'No se pudo cargar la estructura de la clínica.'));
      }
    });
  }

  selectSite(id: string | null): void {
    this.selectedSiteId.set(id);
    this.floorSelection.next(id);
  }

  openClinic(): void {
    const clinic = this.organization();
    this.clinicForm.reset({
      name: clinic?.name ?? '', code: clinic?.code ?? '',
      contactEmail: clinic?.contactEmail ?? '', phone: clinic?.phone ?? ''
    });
    this.open('clinic');
  }

  openSite(site?: Site): void {
    this.editingSiteId.set(site?.id ?? null);
    this.siteForm.reset({ name: site?.name ?? '', address: site?.address ?? '' });
    this.open('site');
  }

  openFloor(): void {
    this.floorForm.reset({ number: 0, name: '', description: '' });
    this.open('floor');
  }

  close(): void {
    if (this.saving()) return;
    this.editor.set(null);
    this.error.set(null);
    this.duplicateAddress.set(false);
  }

  saveClinic(): void {
    if (this.clinicForm.invalid) return this.clinicForm.markAllAsTouched();
    const value = this.clinicForm.getRawValue();
    this.save(this.service.saveOrganization({
      name: value.name.trim(), code: value.code.trim(), contactEmail: value.contactEmail.trim(), phone: value.phone.trim() || null
    }), clinic => {
      this.organization.set(clinic);
      this.success.set('Datos de la clínica guardados.');
    });
  }

  saveSite(allowDuplicateAddress = false): void {
    if (this.siteForm.invalid) return this.siteForm.markAllAsTouched();
    const id = this.editingSiteId();
    const { name, address } = this.siteForm.getRawValue();
    const request = { name: name.trim(), address: address.trim(), allowDuplicateAddress };
    this.save(id ? this.service.updateSite(id, request) : this.service.createSite(request), site => {
      this.sites.update(sites => [...sites.filter(item => item.id !== site.id), site]
        .sort((first, second) => first.name.localeCompare(second.name)));
      this.selectSite(site.id);
      this.success.set(id ? 'Datos de la sede guardados.' : 'Sede registrada.');
    });
  }

  saveFloor(): void {
    if (this.floorForm.invalid) return this.floorForm.markAllAsTouched();
    const site = this.selectedSite();
    const { number, name, description } = this.floorForm.getRawValue();
    if (!site || number === null) return;
    this.save(this.service.createFloor(site.id, { number, name: name.trim(), description: description.trim() }), floor => {
      this.floors.update(floors => [...floors, floor].sort((first, second) => first.number - second.number));
      this.success.set('Piso registrado.');
    });
  }

  private open(editor: 'clinic' | 'site' | 'floor'): void {
    this.duplicateAddress.set(false);
    this.error.set(null);
    this.success.set(null);
    this.editor.set(editor);
  }

  private save<T>(request: Observable<T>, success: (result: T) => void): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.duplicateAddress.set(false);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: result => { this.editor.set(null); success(result); },
      error: (error: HttpErrorResponse) => {
        this.duplicateAddress.set(error.error?.code === 'SITE_ADDRESS_EXISTS');
        this.error.set(this.message(error, 'El servidor no confirmó el guardado.'));
      }
    });
  }

  private message(error: HttpErrorResponse, fallback: string): string {
    if (error.error?.code === 'SITE_ADDRESS_EXISTS') return 'Ya existe una sede con esta dirección. Puedes corregirla o guardar de todas formas.';
    if (error.error?.code === 'FLOOR_NUMBER_EXISTS') return 'Ya existe un piso con este nivel en la sede.';
    if (error.status === 0) return 'No hay conexión con la API. Intenta de nuevo.';
    if (error.status === 403) return 'Tu cuenta no tiene permiso para esta operación.';
    if (error.status === 404) return 'La sede ya no está disponible para tu cuenta.';
    if (error.status === 400) return 'Revisa los campos del formulario.';
    return fallback;
  }
}

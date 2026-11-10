import { Component, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AUTH_PORT } from '../../../iam/application/iam.ports';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
})
export class AdminShellComponent {
  private readonly auth = inject(AUTH_PORT);
  readonly context = input<string | null>(null);
  readonly signingOut = signal(false);

  signOut(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.auth.signOut().pipe(
      finalize(() => this.signingOut.set(false)),
    ).subscribe({ error: () => { /* Login shows the revocation notice. */ } });
  }
}

import { Component, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  host: { '[class.editor-mode]': 'editorMode()' },
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  readonly context = input<string | null>(null);
  readonly editorMode = input(false);
  readonly signingOut = signal(false);

  signOut(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.auth.signOut().pipe(
      finalize(() => this.signingOut.set(false)),
    ).subscribe({ error: () => { /* Login shows the revocation notice. */ } });
  }
}

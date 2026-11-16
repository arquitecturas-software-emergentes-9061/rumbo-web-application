import { Component, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, finalize, map } from 'rxjs';
import { AUTH_PORT } from '../../../iam/application/iam.ports';
import { SubscriptionNoticeComponent } from '../../../subscriptions/presentation/components/subscription-notice/subscription-notice.component';

const isMapsRoute = (url: string) => ['/planning/maps', '/planning/map-editor', '/planning/interfloor-connections']
  .includes(url.split(/[?#]/, 1)[0]);

@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, SubscriptionNoticeComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
})
export class AdminShellComponent {
  private readonly auth = inject(AUTH_PORT);
  private readonly router = inject(Router);
  readonly context = input<string | null>(null);
  readonly signingOut = signal(false);
  readonly mapsActive = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => isMapsRoute(event.urlAfterRedirects))
  ), { initialValue: isMapsRoute(this.router.url) });

  signOut(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.auth.signOut().pipe(
      finalize(() => this.signingOut.set(false)),
    ).subscribe({ error: () => { /* Login shows the revocation notice. */ } });
  }
}

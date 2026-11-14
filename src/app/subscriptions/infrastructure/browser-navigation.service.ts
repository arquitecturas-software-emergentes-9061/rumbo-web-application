import { Injectable } from '@angular/core';
import { BrowserNavigationPort } from '../application/subscriptions.ports';

@Injectable({ providedIn: 'root' })
export class BrowserNavigationService implements BrowserNavigationPort {
  assign(url: string): void {
    window.location.assign(url);
  }
}

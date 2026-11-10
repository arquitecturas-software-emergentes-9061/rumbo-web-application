import { Injectable } from '@angular/core';
import { AuthStoragePort } from '../application/iam.ports';

const STORAGE_KEY = 'rumbo_auth_session';

@Injectable({ providedIn: 'root' })
export class BrowserAuthStorage implements AuthStoragePort {
  read(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  write(value: string): void {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* The in-memory session remains usable. */ }
  }

  remove(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }
}

import { Component } from '@angular/core';

@Component({
  selector: 'app-map-publication-panel',
  template: `<section id="publication" aria-labelledby="publication-title">
    <h2 id="publication-title">Validar y publicar</h2>
    <ng-content />
  </section>`,
  styles: [`
    :host { display: block; margin-top: 16px; scroll-margin-top: 24px; }
    section { padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--panel-radius); }
    h2 { font-size: 1.06rem; margin: 0 0 8px; }
  `]
})
export class MapPublicationPanelComponent {}

import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Floor } from '../../../domain/model/site-floor.model';

type MapSection = 'plan' | 'editor' | 'connections';

@Component({
  selector: 'app-map-section-navigation',
  imports: [RouterLink],
  templateUrl: './map-section-navigation.component.html',
  styleUrl: './map-section-navigation.component.css'
})
export class MapSectionNavigationComponent {
  readonly active = input.required<MapSection>();
  readonly siteName = input<string | null>(null);
  readonly siteId = input<string | null>(null);
  readonly floorId = input<string | null>(null);
  readonly floors = input<Floor[]>([]);
  readonly floorDisabled = input(false);
  readonly floorSelected = output<string>();

  protected readonly floorName = computed(() => this.floors().find(floor => floor.id === this.floorId())?.name ?? null);
  protected readonly location = computed(() => ({ siteId: this.siteId(), floorId: this.floorId() }));
}

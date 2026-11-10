import { TestBed } from '@angular/core/testing';
import { GraphCanvasComponent } from './graph-canvas.component';

describe('GraphCanvasComponent structural backdrop', () => {
  it('shows only recognized zones and editable geometry in draft mode, revealing source candidates on alert focus', () => {
    TestBed.configureTestingModule({ imports: [GraphCanvasComponent] });
    const fixture = TestBed.createComponent(GraphCanvasComponent);
    const polygon = { outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], holes: [] };
    fixture.componentRef.setInput('nodes', []);
    fixture.componentRef.setInput('connections', []);
    fixture.componentRef.setInput('plan', { floorId: 'f', planVersionId: 'v', widthUnits: 100, heightUnits: 100, metersPerUnit: .1 });
    fixture.componentRef.setInput('showSourceGeometry', false);
    fixture.componentRef.setInput('backdrop', {
      zones: [{ id: 'room', name: 'Sala', category: 'ROOM', x: 0, y: 0, width: 50, height: 50 }],
      nodes: [], connections: [], warnings: [], wallCandidates: [{ x1: 80, y1: 0, x2: 80, y2: 100 }],
      doors: [{ id: 'source-door', x1: 80, y1: 40, x2: 80, y2: 60 }], barriers: [{ kind: 'OBSTACLE', polygon }]
    });
    fixture.componentRef.setInput('walls', [{ id: 'saved-wall', floorId: 'f', planVersionId: 'v', x1: 60, y1: 0, x2: 60, y2: 100 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.backdrop .zone')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.backdrop .barrier')).toBeNull();
    expect(fixture.nativeElement.querySelector('.backdrop line:not(.door)')).toBeNull();
    expect(fixture.nativeElement.querySelector('.backdrop line.door.review')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.editable-wall')).not.toBeNull();
    fixture.componentRef.setInput('highlightedWallCandidate', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.backdrop line.selected')).not.toBeNull();
    fixture.componentRef.setInput('walls', [{ id: 'saved-wall', floorId: 'f', planVersionId: 'v',
      x1: 80, y1: 0, x2: 80, y2: 100 }]);
    fixture.componentRef.setInput('doors', [{ id: 'saved-door', wallId: 'saved-wall', from: .4, to: .6 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.backdrop line.door.review')).toBeNull();
    expect(fixture.nativeElement.querySelector('.editable-door')).not.toBeNull();
  });
  it('fits recognized walls and doors outside the initial node bounds in the preview', () => {
    TestBed.configureTestingModule({ imports: [GraphCanvasComponent] });
    const fixture = TestBed.createComponent(GraphCanvasComponent);
    fixture.componentRef.setInput('nodes', []);
    fixture.componentRef.setInput('connections', []);
    fixture.componentRef.setInput('plan', { floorId: 'f', planVersionId: 'v', widthUnits: 100,
      heightUnits: 60, metersPerUnit: .1 });
    fixture.componentRef.setInput('interactiveZones', true);
    fixture.componentRef.setInput('backdrop', { zones: [], nodes: [], connections: [], warnings: [],
      wallCandidates: [{ x1: 140, y1: 10, x2: 150, y2: 10 }],
      doors: [{ id: 'd', x1: 145, y1: 10, x2: 148, y2: 10 }] });
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('svg.canvas').getAttribute('viewBox')
      .split(' ').map(Number);
    expect(box[0] + box[2]).toBeGreaterThan(150);
    expect(fixture.nativeElement.querySelector('.backdrop line.door')).not.toBeNull();
  });
  it('retains holes, structural barriers and diagonal doors after applying a proposal', () => {
    TestBed.configureTestingModule({ imports: [GraphCanvasComponent] });
    const fixture = TestBed.createComponent(GraphCanvasComponent);
    const polygon = { outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      holes: [[{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }]] };
    fixture.componentRef.setInput('nodes', []);
    fixture.componentRef.setInput('connections', []);
    fixture.componentRef.setInput('plan', { floorId: 'f', planVersionId: 'v', widthUnits: 100, heightUnits: 100, metersPerUnit: 0.1 });
    fixture.componentRef.setInput('backdrop', {
      zones: [{ id: 's', name: 'Pasillo', category: 'CORRIDOR', x: 0, y: 0, width: 100, height: 100, polygon }],
      nodes: [], connections: [], wallCandidates: [], warnings: [],
      barriers: [{ kind: 'OBSTACLE', polygon }], doors: [{ id: 'd', x1: 10, y1: 20, x2: 20, y2: 30 }]
    });
    fixture.detectChanges();
    const path = fixture.nativeElement.querySelector('.backdrop path.zone');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('d').match(/M /g)).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('path.barrier.obstacle')).not.toBeNull();
    const door = fixture.nativeElement.querySelector('line.door');
    expect(door.getAttribute('x1')).toBe('10');
    expect(door.getAttribute('x2')).toBe('20');
    expect(door.getAttribute('y2')).toBe('30');
  });
});

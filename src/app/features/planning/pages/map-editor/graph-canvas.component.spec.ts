import { TestBed } from '@angular/core/testing';
import { GraphCanvasComponent } from './graph-canvas.component';

describe('GraphCanvasComponent structural backdrop', () => {
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

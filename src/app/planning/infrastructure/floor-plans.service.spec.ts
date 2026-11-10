import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { FloorPlansService } from './floor-plans.service';

describe('Floor plan HTTP contract', () => {
  let service: FloorPlansService;
  let http: HttpTestingController;
  const plans = environment.apiUrl + '/sites/site-1/floors/floor-1/plans';
  const scale = environment.apiUrl + '/sites/site-1/plan-calibrations/original-1';
  const version = { id: 'original-1', version: 1, fileName: 'piso.svg', mediaType: 'image/svg+xml',
    sizeBytes: 21, createdAt: '2026-11-06T00:00:00Z' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FloorPlansService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('requests the interpretation of the selected stored version without reuploading it', () => {
    const result = { versionId: version.id, floorId: 'floor-1', mediaType: version.mediaType,
      processing: 'SVG_CANDIDATES', scaleStatus: 'PROVISIONAL', metersPerUnit: null, proposal: null };
    service.interpret('site-1', 'floor-1', version.id).subscribe(response => expect(response).toEqual(result));
    const call = http.expectOne({ method: 'POST', url: plans + '/versions/original-1/interpretation' });
    expect(call.request.body).toBeNull();
    call.flush(result);
  });

  it('lists versions, posts the original as multipart file and downloads the selected version', () => {
    service.list('site-1', 'floor-1').subscribe(result => expect(result).toEqual([version]));
    http.expectOne({ method: 'GET', url: plans }).flush([version]);

    const file = new File(['<svg/>'], 'piso.svg', { type: 'image/svg+xml' });
    service.upload('site-1', 'floor-1', file).subscribe(result => expect(result).toEqual(version));
    const upload = http.expectOne({ method: 'POST', url: plans });
    expect(upload.request.body.get('file')).toEqual(file);
    expect(upload.request.headers.has('Content-Type')).toBe(false);
    upload.flush(version, { status: 201, statusText: 'Created' });

    service.original('site-1', 'floor-1', version.id).subscribe(result => {
      expect(result.body).toBe(file);
      expect(result.headers.get('X-Plan-Width')).toBe('100');
    });
    const download = http.expectOne({ method: 'GET', url: plans + '/versions/original-1' });
    expect(download.request.responseType).toBe('blob');
    download.flush(file, { headers: { 'X-Plan-Width': '100', 'X-Plan-Height': '100' } });
  });

  it('reads and writes a calibration for the original ID and only accepts its explicit missing code', () => {
    service.calibration('site-1', version.id).subscribe(value => expect(value).toBeNull());
    http.expectOne({ method: 'GET', url: scale })
      .flush({ code: 'CALIBRATION_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    service.calibration('site-1', version.id).subscribe({ error: error => expect(error.status).toBe(403) });
    http.expectOne({ method: 'GET', url: scale }).flush(null, { status: 403, statusText: 'Forbidden' });

    const input = { floorId: 'floor-1', unit: 'CENTIMETERS' as const, measuredDistance: 500,
      startX: 10, startY: 10, endX: 60, endY: 10 };
    const saved = { ...input, planVersionId: version.id, metersPerUnit: 0.1 };
    service.save('site-1', version.id, input).subscribe(value => expect(value).toEqual(saved));
    const update = http.expectOne({ method: 'PUT', url: scale });
    expect(update.request.body).toEqual(input);
    update.flush(saved);
    service.calibration('site-1', version.id).subscribe(value => expect(value).toEqual(saved));
    http.expectOne({ method: 'GET', url: scale }).flush(saved);
  });
});

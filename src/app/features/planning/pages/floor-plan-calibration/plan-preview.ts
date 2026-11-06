/** Render the original PDF page with the same rotation and aspect ratio as the source. */
export async function renderPdfPreview(file: Blob): Promise<Blob> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const assets = new URL('pdfjs/', document.baseURI).href;
  GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.min.mjs';
  const task = getDocument({
    data: await file.arrayBuffer(),
    cMapUrl: assets + 'cmaps/',
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    iccUrl: assets + 'iccs/',
  });
  try {
    const page = await (await task.promise).getPage(1);
    const source = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 2000 / Math.max(source.width, source.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(image => image ? resolve(image) : reject(new Error('PDF preview failed')), 'image/png');
    });
  } finally {
    await task.destroy();
  }
}

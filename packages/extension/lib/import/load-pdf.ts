// Loads pdf.js only when someone imports a PDF, so the library page stays light.
import type { PdfDoc } from "./pdf";

export async function loadPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes });
  return (await task.promise) as unknown as PdfDoc;
}

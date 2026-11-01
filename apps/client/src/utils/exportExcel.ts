import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { ExportWorkerRequest, ExportWorkerResponse } from '@/workers/exportWorker';
import { saveBinaryFile } from '@/adapters/nativeAdapter';

export interface ExcelColumn<T> {
  /** Заголовок столбца в Excel */
  header: string;
  /** Значение ячейки для строки */
  value: (row: T) => string | number;
}

/**
 * Generate Excel ArrayBuffer via background Web Worker (or synchronous fallback)
 */
async function generateExcelBuffer(
  data: Record<string, string | number>[],
  headers: string[],
  sheetName: string,
): Promise<ArrayBuffer> {
  if (typeof Worker !== 'undefined' && typeof window !== 'undefined') {
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
          worker.terminate();
          if (e.data.success && e.data.buffer) {
            resolve(e.data.buffer);
          } else {
            reject(new Error(e.data.error ?? 'Worker export failed'));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(err);
        };

        const req: ExportWorkerRequest = { data, headers, sheetName };
        worker.postMessage(req);
      });
    } catch {
      // Worker failed — fallback to sync execution
    }
  }

  // Fallback: Synchronous SheetJS generation
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
}

/**
 * Universal table export to .xlsx (SheetJS + Web Worker)
 * Supports Web (browser download) and Tauri desktop file system save dialog via NativeAdapter.
 */
export async function exportToExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  fileName: string,
  sheetName = 'Лист1',
): Promise<void> {
  const data = rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const col of columns) record[col.header] = col.value(row);
    return record;
  });

  const headers = columns.map((c) => c.header);
  const stamp = dayjs().format('YYYY-MM-DD');
  const fullFileName = `${fileName}_${stamp}.xlsx`;

  const excelBuffer = await generateExcelBuffer(data, headers, sheetName);

  await saveBinaryFile({
    defaultFileName: fullFileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    data: excelBuffer,
  });
}

import * as XLSX from 'xlsx';

export interface ExportWorkerRequest {
  data: Record<string, string | number>[];
  headers: string[];
  sheetName: string;
}

export interface ExportWorkerResponse {
  success: boolean;
  buffer?: ArrayBuffer;
  error?: string;
}

self.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  try {
    const { data, headers, sheetName } = e.data;
    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer;

    const response: ExportWorkerResponse = {
      success: true,
      buffer: excelBuffer,
    };

    // Transfer the ArrayBuffer back to main thread with zero copy
    self.postMessage(response, [excelBuffer]);
  } catch (err: unknown) {
    const response: ExportWorkerResponse = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

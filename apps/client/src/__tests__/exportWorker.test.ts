import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('Excel generation logic', () => {
  it('generates a valid binary XLSX workbook from tabular rows', () => {
    const data = [
      { 'Штрих-код': '4870001234567', Название: 'Мороженое Пломбир', Остаток: 150 },
      { 'Штрих-код': '4870007654321', Название: 'Мороженое Эскимо', Остаток: 80 },
    ];
    const headers = ['Штрих-код', 'Название', 'Остаток'];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Товары');

    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer;

    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Verify the workbook can be read back accurately
    const parsed = XLSX.read(buffer, { type: 'array' });
    expect(parsed.SheetNames).toContain('Товары');
    const sheetData = XLSX.utils.sheet_to_json(parsed.Sheets['Товары']);
    expect(sheetData).toHaveLength(2);
  });
});

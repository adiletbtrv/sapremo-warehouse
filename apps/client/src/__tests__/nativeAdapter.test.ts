import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNativeTauri,
  getRuntimeEnvironment,
  nativeFetch,
  saveBinaryFile,
  invokeNativeCommand,
} from '../adapters/nativeAdapter';

describe('Tauri / Web Native Adapter Facade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if ('__TAURI_INTERNALS__' in window) {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
    if ('__TAURI__' in window) {
      delete (window as unknown as Record<string, unknown>).__TAURI__;
    }
  });

  it('detects standalone Web SPA mode when Tauri internals are absent', () => {
    expect(isNativeTauri()).toBe(false);
    expect(getRuntimeEnvironment()).toBe('web-spa');
  });

  it('detects Tauri Desktop mode when __TAURI_INTERNALS__ is injected', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isNativeTauri()).toBe(true);
    expect(getRuntimeEnvironment()).toBe('tauri-desktop');
  });

  it('falls back to standard browser fetch in Web SPA mode', async () => {
    const mockResponse = new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const res = await nativeFetch('/api/health');
    expect(fetchSpy).toHaveBeenCalledWith('/api/health', undefined);
    expect(res.status).toBe(200);
  });

  it('triggers HTML5 Blob download in Web SPA mode when saveBinaryFile is called', async () => {
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:http://localhost:3000/mock-file');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const saved = await saveBinaryFile({
      defaultFileName: 'inventory_report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: new Uint8Array([1, 2, 3, 4]),
    });

    expect(saved).toBe(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    revokeObjectUrlSpy.mockRestore();
  });

  it('executes Web fallback handler in invokeNativeCommand when running in browser', async () => {
    const result = await invokeNativeCommand(
      'get_printer_status',
      { printerId: 'thermal-01' },
      (args) => ({ ready: true, printerId: args?.printerId })
    );
    expect(result).toEqual({ ready: true, printerId: 'thermal-01' });
  });
});


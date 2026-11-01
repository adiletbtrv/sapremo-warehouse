/**
 * Unified Tauri / Web Native Adapter Facade
 *
 * Isolates all @tauri-apps/* runtime bindings behind a single adapter interface
 * with automatic fallback to standard Web APIs (Fetch, Blob Download, Web Storage)
 * so the Warehouse client runs identically as a standalone browser SPA (`npm run dev`)
 * or as a compiled Tauri desktop binary (`npm run build:tauri`).
 */

export interface SaveFileFilter {
  name: string;
  extensions: string[];
}

export interface SaveBinaryFileOptions {
  defaultFileName: string;
  mimeType: string;
  filters?: SaveFileFilter[];
  data: Uint8Array | ArrayBuffer | Blob;
}

/**
 * Detects whether the application is executing inside a Tauri Desktop WebView container.
 */
export function isNativeTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/**
 * Returns a human-readable descriptor of the active runtime shell.
 */
export function getRuntimeEnvironment(): 'tauri-desktop' | 'web-spa' {
  return isNativeTauri() ? 'tauri-desktop' : 'web-spa';
}

/**
 * Unified HTTP Fetch facade.
 * Uses `@tauri-apps/plugin-http` when inside Tauri Desktop, falling back
 * to standard browser `fetch` in standalone Web SPA mode.
 */
export async function nativeFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (isNativeTauri()) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      return await tauriFetch(input as string, init);
    } catch {
      // Fallback to standard browser fetch if Tauri plugin is unavailable
    }
  }
  return fetch(input, init);
}

/**
 * Unified Binary File Export facade (Excel / PDF / Reports).
 * Uses native OS save dialog (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`)
 * in Tauri Desktop and falls back to HTML5 Blob anchor download in Web SPA mode.
 *
 * @returns `true` if the file was saved/downloaded, `false` if the user cancelled.
 */
export async function saveBinaryFile(options: SaveBinaryFileOptions): Promise<boolean> {
  const { defaultFileName, mimeType, filters, data } = options;

  if (isNativeTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        defaultPath: defaultFileName,
        filters: filters ?? [{ name: 'Document', extensions: ['*'] }],
      });

      if (!filePath) {
        return false; // User cancelled native dialog
      }

      let uint8Data: Uint8Array;
      if (data instanceof Uint8Array) {
        uint8Data = data;
      } else if (data instanceof ArrayBuffer) {
        uint8Data = new Uint8Array(data);
      } else {
        const arrayBuffer = await data.arrayBuffer();
        uint8Data = new Uint8Array(arrayBuffer);
      }

      await writeFile(filePath, uint8Data);
      return true;
    } catch {
      // Fall through to Web Native Blob download if Tauri FS/Dialog fails
    }
  }

  // Web Native / Standalone SPA Fallback
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data instanceof Uint8Array ? (data as unknown as BlobPart) : data], {
          type: mimeType,
        });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', defaultFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Unified Tauri IPC command invoker with Web Native fallback handler.
 */
export async function invokeNativeCommand<TArgs extends Record<string, unknown>, TResult>(
  command: string,
  args?: TArgs,
  webFallback?: (args?: TArgs) => Promise<TResult> | TResult
): Promise<TResult> {
  if (isNativeTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<TResult>(command, args);
    } catch (error) {
      if (webFallback) {
        return await webFallback(args);
      }
      throw error;
    }
  }

  if (webFallback) {
    return await webFallback(args);
  }

  throw new Error(
    `[NativeAdapter] Command "${command}" is not supported in Web SPA mode without a fallback.`
  );
}


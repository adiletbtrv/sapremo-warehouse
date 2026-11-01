import { useEffect, useRef } from 'react';
import { playFeedbackSound } from '@/utils/soundFeedback';

export interface UseBarcodeScannerOptions {
  /** Callback fired when a complete barcode is successfully scanned */
  onScan: (barcode: string) => void | Promise<void>;
  /** Optional callback fired when scan timing or length validation fails */
  onError?: (invalidRawInput: string) => void;
  /** Minimum length of a valid barcode string (default: 3) */
  minBarcodeLength?: number;
  /** Maximum interval in milliseconds between keystrokes to qualify as a hardware scanner (default: 40ms) */
  maxIntervalMs?: number;
  /** If true, scanner events are captured even when focusing inside input/textarea fields (default: false) */
  listenInInputs?: boolean;
  /** Whether the scanner listener is currently active (default: true) */
  enabled?: boolean;
  /** If true, automatically plays audio feedback beep upon scan detection (default: false) */
  playSoundOnScan?: boolean;
  /** If true, prevent default Enter/Tab action when barcode is finalized (default: true) */
  preventDefaultOnEnter?: boolean;
}

/**
 * Normalizes keyboard layout quirks (e.g. Russian layout Caps/Shift mappings) to standard barcode characters.
 */
const RU_EN_MAP: Record<string, string> = {
  ё: '`',
  Ё: '~',
  '№': '#',
  й: 'q',
  ц: 'w',
  у: 'e',
  к: 'r',
  е: 't',
  н: 'y',
  г: 'u',
  ш: 'i',
  щ: 'o',
  з: 'p',
  х: '[',
  ъ: ']',
  ф: 'a',
  ы: 's',
  в: 'd',
  а: 'f',
  п: 'g',
  р: 'h',
  о: 'j',
  л: 'k',
  д: 'l',
  ж: ';',
  э: "'",
  я: 'z',
  ч: 'x',
  с: 'c',
  м: 'v',
  и: 'b',
  т: 'n',
  ь: 'm',
  б: ',',
  ю: '.',
  Й: 'Q',
  Ц: 'W',
  У: 'E',
  К: 'R',
  Е: 'T',
  Н: 'Y',
  Г: 'U',
  Ш: 'I',
  Щ: 'O',
  З: 'P',
  Х: '{',
  Ъ: '}',
  Ф: 'A',
  Ы: 'S',
  В: 'D',
  А: 'F',
  П: 'G',
  Р: 'H',
  О: 'J',
  Л: 'K',
  Д: 'L',
  Ж: ':',
  Э: '"',
  Я: 'Z',
  Ч: 'X',
  С: 'C',
  М: 'V',
  И: 'B',
  Т: 'N',
  Ь: 'M',
  Б: '<',
  Ю: '>',
};

export function normalizeBarcodeLayout(raw: string): string {
  let normalized = '';
  for (const char of raw) {
    const mapped = RU_EN_MAP[char] ?? char;
    const code = mapped.charCodeAt(0);
    // Keep printable characters (code >= 32 and not DEL 127)
    if (code >= 32 && code !== 127) {
      normalized += mapped;
    }
  }
  return normalized.trim();
}

/**
 * Global Hardware HID Barcode Scanner Hook
 * Intercepts high-speed sequential keyboard input emitted by 1D/2D USB/Bluetooth barcode scanners.
 */
export function useBarcodeScanner({
  onScan,
  onError,
  minBarcodeLength = 3,
  maxIntervalMs = 40,
  listenInInputs = false,
  enabled = true,
  playSoundOnScan = false,
  preventDefaultOnEnter = true,
}: UseBarcodeScannerOptions): void {
  const bufferRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      // Check if target is an interactive input
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Check for explicit barcode receiver attribute
      const isExplicitBarcodeReceiver =
        typeof target?.hasAttribute === 'function' &&
        (target.hasAttribute('data-barcode-receiver') ||
          target.hasAttribute('data-allow-barcode'));

      if (isInput && !listenInInputs && !isExplicitBarcodeReceiver) {
        return;
      }

      const currentTime = performance.now();
      const timeDiff = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;

      const key = event.key;

      // Scanner signals end of barcode via Enter or Tab
      if (key === 'Enter' || key === 'Tab') {
        const rawBuffer = bufferRef.current;
        bufferRef.current = '';

        if (rawBuffer.length >= minBarcodeLength) {
          const barcode = normalizeBarcodeLayout(rawBuffer);

          if (preventDefaultOnEnter) {
            event.preventDefault();
            event.stopPropagation();
          }

          if (playSoundOnScan) {
            playFeedbackSound('success');
          }

          void onScanRef.current(barcode);
        } else if (rawBuffer.length > 0 && onErrorRef.current) {
          onErrorRef.current(rawBuffer);
        }
        return;
      }

      // Ignore non-printable modifier keys
      if (
        key === 'Shift' ||
        key === 'Control' ||
        key === 'Alt' ||
        key === 'Meta' ||
        key === 'CapsLock' ||
        key === 'Escape' ||
        key.length > 1
      ) {
        return;
      }

      // If typing speed exceeds maxIntervalMs, discard buffer (human typing)
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      bufferRef.current += key;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    enabled,
    listenInInputs,
    maxIntervalMs,
    minBarcodeLength,
    playSoundOnScan,
    preventDefaultOnEnter,
  ]);
}

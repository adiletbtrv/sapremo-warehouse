import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBarcodeScanner, normalizeBarcodeLayout } from '../hooks/useBarcodeScanner';
import { playFeedbackSound } from '../utils/soundFeedback';

describe('Hardware HID Barcode Scanner Parser, Debouncer & Layout Normalizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures high-speed EAN-13 and Code 128 hardware scanner bursts (< 50ms/char) without losing characters', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minBarcodeLength: 4, maxIntervalMs: 50 }));

    // 1. Simulate high-speed EAN-13 scan (8ms between hardware HID keystrokes)
    const ean13 = '4870001000013';
    for (const char of ean13) {
      vi.advanceTimersByTime(8);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(8);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenLastCalledWith('4870001000013');

    // 2. Simulate high-speed alphanumeric Code 128 batch barcode scan (10ms between keystrokes)
    const code128 = 'C128-W01-SKU0042-B007';
    for (const char of code128) {
      vi.advanceTimersByTime(10);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenLastCalledWith('C128-W01-SKU0042-B007');
  });

  it('rejects slow manual human typing (> 50ms inter-keystroke delay) via debounce buffer reset', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minBarcodeLength: 5, maxIntervalMs: 50 }));

    // Human typing at ~140ms per keystroke
    const manualInput = '4870001000013';
    for (const char of manualInput) {
      vi.advanceTimersByTime(140);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(140);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Because each keystroke exceeded 50ms, the buffer reset on each key and never reached minLength (5)
    expect(onScan).not.toHaveBeenCalled();
  });

  it('normalizes Russian/Cyrillic OS keyboard layout keystrokes into ASCII barcodes during hardware scan', () => {
    expect(normalizeBarcodeLayout('4700010010015')).toBe('4700010010015');
    expect(normalizeBarcodeLayout('йцукен')).toBe('qwerty');
    expect(normalizeBarcodeLayout('С128-Ц01')).toBe('C128-W01');

    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minBarcodeLength: 4, maxIntervalMs: 50 }));

    // Hardware scanner firing while OS layout is accidentally set to Russian ("С128-Ц01")
    const cyrillicScan = 'С128-Ц01';
    for (const char of cyrillicScan) {
      vi.advanceTimersByTime(6);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(6);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).toHaveBeenCalledWith('C128-W01');
  });

  it('ignores keystrokes inside standard text inputs unless data-allow-barcode="true" is set', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minBarcodeLength: 4, maxIntervalMs: 50 }));

    const regularInput = document.createElement('input');
    document.body.appendChild(regularInput);

    for (const char of '4870001000013') {
      vi.advanceTimersByTime(5);
      regularInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(5);
    regularInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onScan).not.toHaveBeenCalled();

    // Now test input explicitly opted-in with data-allow-barcode="true"
    regularInput.setAttribute('data-allow-barcode', 'true');
    for (const char of '4870001000020') {
      vi.advanceTimersByTime(5);
      regularInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    vi.advanceTimersByTime(5);
    regularInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('4870001000020');

    document.body.removeChild(regularInput);
  });

  it('plays feedback sound without throwing errors in headless/test environment', () => {
    expect(() => {
      playFeedbackSound('success');
      playFeedbackSound('error');
      playFeedbackSound('warning');
    }).not.toThrow();
  });
});

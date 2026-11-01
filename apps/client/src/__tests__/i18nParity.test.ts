import { describe, it, expect } from 'vitest';
import ru from '../i18n/locales/ru.json';
import ky from '../i18n/locales/ky.json';
import en from '../i18n/locales/en.json';

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

describe('i18n Key Parity and Synchronization Tests', () => {
  const ruFlat = flattenObject(ru as Record<string, unknown>);
  const kyFlat = flattenObject(ky as Record<string, unknown>);
  const enFlat = flattenObject(en as Record<string, unknown>);

  const ruKeys = Object.keys(ruFlat).sort();
  const kyKeys = Object.keys(kyFlat).sort();
  const enKeys = Object.keys(enFlat).sort();

  it('should have the exact same number of keys in RU, KY, and EN dictionaries', () => {
    expect(ruKeys.length).toBeGreaterThan(0);
    expect(kyKeys.length).toBe(ruKeys.length);
    expect(enKeys.length).toBe(ruKeys.length);
  });

  it('should contain all RU keys in KY dictionary without empty strings', () => {
    for (const key of ruKeys) {
      expect(kyFlat[key], `Missing or empty key "${key}" in ky.json`).toBeDefined();
      expect(kyFlat[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('should contain all RU keys in EN dictionary without empty strings', () => {
    for (const key of ruKeys) {
      expect(enFlat[key], `Missing or empty key "${key}" in en.json`).toBeDefined();
      expect(enFlat[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('should not have unexpected extra keys in KY or EN', () => {
    const extraKy = kyKeys.filter((k) => !ruFlat[k]);
    const extraEn = enKeys.filter((k) => !ruFlat[k]);
    expect(extraKy).toEqual([]);
    expect(extraEn).toEqual([]);
  });
});

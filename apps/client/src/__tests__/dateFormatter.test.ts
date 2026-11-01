import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate, formatTime } from '../utils/dateFormatter';

describe('dateFormatter utility', () => {
  it('formats dates in DD.MM.YYYY format by default', () => {
    expect(formatDate('2026-08-14T15:30:00.000Z')).toBe('14.08.2026');
  });

  it('formats time in HH:mm format', () => {
    const formatted = formatTime('2026-08-14T15:30:00.000Z');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('formats full date and time with pattern dateTime', () => {
    const formatted = formatDateTime('2026-08-14T15:30:00.000Z', 'dateTime');
    expect(formatted).toContain('14.08.2026');
    expect(formatted).toContain(':');
  });

  it('returns fallback for null or undefined dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDateTime(null, 'full', 'N/A')).toBe('N/A');
  });

  it('returns fallback for invalid date strings', () => {
    expect(formatDate('invalid-date')).toBe('—');
  });
});

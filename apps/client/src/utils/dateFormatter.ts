import dayjs from 'dayjs';

// prettier-ignore
export type DateFormatPattern =
  | 'date' // DD.MM.YYYY
  | 'time' // HH:mm
  | 'dateTime' // DD.MM.YYYY, HH:mm
  | 'full' // DD.MM.YYYY, HH:mm:ss
  | 'iso' // YYYY-MM-DD
  | 'short'; // DD.MM

const PATTERNS: Record<DateFormatPattern, string> = {
  date: 'DD.MM.YYYY',
  time: 'HH:mm',
  dateTime: 'DD.MM.YYYY, HH:mm',
  full: 'DD.MM.YYYY, HH:mm:ss',
  iso: 'YYYY-MM-DD',
  short: 'DD.MM',
};

/**
 * Centralized Date & Time formatting utility
 * @param date ISO string, Date object, dayjs, or undefined
 * @param pattern predefined format pattern (default: 'date')
 * @param fallback fallback string if date is missing/invalid (default: '—')
 */
export function formatDateTime(
  date: string | number | Date | dayjs.Dayjs | null | undefined,
  pattern: DateFormatPattern | (string & Record<never, never>) = 'date',
  fallback = '—',
): string {
  if (!date) return fallback;

  const parsed = dayjs(date);
  if (!parsed.isValid()) return fallback;

  const formatStr = PATTERNS[pattern as DateFormatPattern] ?? pattern;
  return parsed.format(formatStr);
}

export function formatDate(
  date: string | number | Date | dayjs.Dayjs | null | undefined,
  fallback = '—',
): string {
  return formatDateTime(date, 'date', fallback);
}

export function formatTime(
  date: string | number | Date | dayjs.Dayjs | null | undefined,
  fallback = '—',
): string {
  return formatDateTime(date, 'time', fallback);
}

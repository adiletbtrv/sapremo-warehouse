/**
 * Safe currency and financial arithmetic utilities for WMS transactions.
 * Protects against IEEE-754 floating point precision errors (e.g. 19.990000000000002).
 */

/**
 * Rounds a floating point numeric value to 2 decimal places using half-up / epsilon banking rule.
 *
 * @param val Number to round
 * @returns Precision-safe number with at most 2 decimal places
 */
export function roundCurrency(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a numeric amount with localized thousands separators.
 *
 * @param val Numeric amount
 * @param decimals Decimal digits count (default: auto/clean decimals, or fixed if specified)
 * @returns Formatted string without currency suffix
 */
export function formatMoney(val: number | string | null | undefined, decimals?: number): string {
  const rounded = roundCurrency(val);
  if (decimals !== undefined) {
    return rounded.toLocaleString('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return rounded.toLocaleString('ru-RU');
}

/**
 * Formats a currency amount with localized thousands separators and fixed 2 decimals.
 *
 * @param val Numeric amount
 * @param currency Currency symbol/label (default: 'сом')
 * @returns Formatted currency string
 */
export function formatCurrency(val: number | string | null | undefined, currency = 'сом'): string {
  const formatted = formatMoney(val, 2);
  return `${formatted} ${currency}`.trim();
}

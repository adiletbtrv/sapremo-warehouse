export interface Period {
  /** YYYY-MM-DD включительно */
  start: string;
  /** YYYY-MM-DD включительно */
  end: string;
}

export function inPeriod(date: string, period: Period): boolean {
  if (!date) return false;
  const dateOnly = date.length > 10 ? date.slice(0, 10) : date;
  return dateOnly >= period.start && dateOnly <= period.end;
}

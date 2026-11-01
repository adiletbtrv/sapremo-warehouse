import type { ReturnReason } from '@/types';

export const REASON_OPTIONS: { value: ReturnReason; label: string }[] = [
  { value: 'unsold', label: 'Не продано' },
  { value: 'melted', label: 'Растаяло' },
  { value: 'damaged', label: 'Повреждено' },
  { value: 'defective', label: 'Брак' },
  { value: 'other', label: 'Другое' },
];

export const REASON_LABEL: Record<ReturnReason, string> = Object.fromEntries(
  REASON_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReturnReason, string>;

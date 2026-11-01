import { z } from 'zod';
import type { TransactionType } from '@/types';
import type { TFunction } from 'i18next';

export type MainTab = 'payment_form' | 'history';
export type PaymentType = TransactionType;

export const getPaymentSchema = (paymentType: PaymentType, t: TFunction, _maxAmount?: number) =>
  z.object({
    amount: z.coerce
      .number({
        message: t('payment.errors.amount_required', 'Введите сумму'),
      })
      .positive(t('payment.errors.amount_positive', 'Сумма должна быть больше 0')),
    date: z.date({
      message: t('payment.errors.date_required', 'Выберите дату'),
    }),
    paymentMethod: z.enum(['cash', 'transfer']),
    comment: z
      .string()
      .trim()
      .optional()
      .transform((value) => value ?? undefined),
    driverId: z
      .string()
      .optional()
      .refine((value) => (paymentType === 'driver_payment' ? !!value : true), {
        message: t('payment.errors.driver_required', 'Выберите водителя'),
      }),
  });

export type ValidPaymentValues = z.output<ReturnType<typeof getPaymentSchema>>;
export type PaymentFormValues = z.input<ReturnType<typeof getPaymentSchema>>;

export const getDefaultValues = (existingDate?: Date): PaymentFormValues => ({
  amount: undefined,
  comment: '',
  driverId: undefined,
  date: existingDate ?? new Date(),
  paymentMethod: 'cash',
});

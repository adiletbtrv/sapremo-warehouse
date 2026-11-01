import { z } from 'zod';
import type { TFunction } from 'i18next';

export const getDriverSchema = (t: TFunction) =>
  z.object({
    fullName: z
      .string()
      .min(1, t('drivers.errFullNameRequired', { defaultValue: 'ФИО обязательно' }))
      .min(
        3,
        t('drivers.errFullNameLength', { defaultValue: 'ФИО должно быть не менее 3 символов' }),
      ),
    carNumber: z.string().optional().or(z.literal('')),
    /** phone: required for new drivers (POST /api/drivers). Optional for existing (edit only changes local). */
    phone: z.string().optional().or(z.literal('')),
    /** password: required only when creating a new driver */
    password: z
      .string()
      .optional()
      .refine((val) => val === undefined || val === '' || val.length >= 8, {
        message: t('drivers.errPasswordLength', {
          defaultValue: 'Пароль должен быть не менее 8 символов',
        }),
      }),
    currentDebt: z
      .number()
      .min(0, t('drivers.errDebtNegative', { defaultValue: 'Долг не может быть отрицательным' }))
      .default(0),
  });

export type DriverFormData = z.infer<ReturnType<typeof getDriverSchema>>;

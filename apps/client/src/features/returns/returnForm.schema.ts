import { z } from 'zod';

import type { TFunction } from 'i18next';

export const getReturnItemSchema = (t: TFunction) =>
  z
    .object({
      barcode: z.string().min(1, t('returns.errSelectProduct', { defaultValue: 'Выберите товар' })),
      boxCount: z.number().min(0, '≥ 0').nullish(),
      quantity: z.number().min(0, '≥ 0').nullish(),
      reason: z.enum(['unsold', 'melted', 'damaged', 'defective', 'other'], {
        error: t('returns.errReason', { defaultValue: 'Причина' }),
      }),
    })
    .refine((data) => (Number(data.boxCount) || 0) > 0 || (Number(data.quantity) || 0) > 0, {
      message: t('returns.errMinQuantityOrBoxes', {
        defaultValue: 'Укажите количество коробок или штук (> 0)',
      }),
      path: ['quantity'],
    });

export const getReturnSchema = (t: TFunction) =>
  z
    .object({
      returnType: z.enum(['from_driver', 'to_factory']),
      driverId: z.string().optional(),
      items: z
        .array(getReturnItemSchema(t))
        .min(1, t('returns.errMinItems', { defaultValue: 'Добавьте хотя бы один товар' })),
      notes: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.returnType === 'from_driver' && !data.driverId) {
          return false;
        }
        return true;
      },
      {
        message: t('returns.errSelectDriver', { defaultValue: 'Выберите водителя' }),
        path: ['driverId'],
      },
    );

export type ReturnFormValues = z.infer<ReturnType<typeof getReturnSchema>>;

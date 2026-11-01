import { z } from 'zod';
import type { TFunction } from 'i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

export const getSupplyItemSchema = (t: TFunction) =>
  z.object({
    barcode: z.string().min(1, t('validation.selectProduct', { defaultValue: 'Выберите товар' })),
    quantityBoxes: z
      .number({
        error: t('validation.enterBoxes', { defaultValue: 'Укажите кол-во коробок' }),
      })
      .int(t('validation.onlyIntegers', { defaultValue: 'Только целые числа' }))
      .min(1, t('validation.minOneBox', { defaultValue: 'Минимум 1 коробка' })),
  });

export const getReceiptSchema = (t: TFunction) =>
  z.object({
    date: z.custom<Dayjs>((val) => val != null && dayjs.isDayjs(val), {
      message: t('validation.selectDate', { defaultValue: 'Выберите дату' }),
    }),
    invoiceNumber: z.string().optional(),
    supplierName: z
      .string()
      .min(1, t('validation.enterSupplier', { defaultValue: 'Укажите поставщика' })),
    items: z
      .array(getSupplyItemSchema(t))
      .min(
        1,
        t('validation.addAtLeastOneProduct', { defaultValue: 'Добавьте хотя бы один товар' }),
      ),
  });

export type ReceiptFormValues = z.infer<ReturnType<typeof getReceiptSchema>>;

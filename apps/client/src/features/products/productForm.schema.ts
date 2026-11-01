import { z } from 'zod';
import type { TFunction } from 'i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

export const getProductSchema = (t: TFunction) => {
  const dayjsSchema = z.custom<Dayjs>((val) => val != null && dayjs.isDayjs(val), {
    message: t('validation.selectDate', { defaultValue: 'Выберите дату' }),
  });

  return z.object({
    barcode: z
      .string()
      .min(1, t('products.errBarcodeRequired', { defaultValue: 'Введите штрих-код' })),
    name: z.string().min(1, t('products.errNameRequired', { defaultValue: 'Введите название' })),
    boxQuantity: z
      .number({
        error: t('products.errQuantityRequired', { defaultValue: 'Укажите количество' }),
      })
      .min(1, t('products.errMinQuantity', { defaultValue: 'Минимум 1' })),
    expirationDate: dayjsSchema,
    factoryPrice: z
      .number({
        error: t('products.errPriceRequired', { defaultValue: 'Укажите цену завода' }),
      })
      .min(0, t('products.errMinPrice', { defaultValue: 'Не меньше 0' })),
    status: z.enum(['active', 'inactive', 'low_stock', 'no_stock'], {
      error: t('products.errStatusRequired', { defaultValue: 'Выберите статус' }),
    }),
  });
};

export type ProductFormValues = z.infer<ReturnType<typeof getProductSchema>>;

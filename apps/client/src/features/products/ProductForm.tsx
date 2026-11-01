import { Form, Input, InputNumber, Select, Space, Button, DatePicker } from 'antd';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ProductStatus } from '@/types';
import type { ProductFormValues } from './productForm.schema';

const { Option } = Select;

/**
 * Поля формы товара на React Hook Form + Zod. Состоянием формы управляет
 * родитель (ProductsPage) через FormProvider; здесь только разметка и Controller
 */
export default function ProductForm({ isEditing }: { isEditing: boolean }) {
  const { t } = useTranslation();
  const {
    control,
    formState: { errors },
  } = useFormContext<ProductFormValues>();

  const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
    { value: 'active', label: t('products.statusActive', { defaultValue: 'Активен' }) },
    { value: 'inactive', label: t('products.statusInactive', { defaultValue: 'Неактивен' }) },
    { value: 'low_stock', label: t('products.statusLowStock', { defaultValue: 'Заканчивается' }) },
    {
      value: 'no_stock',
      label: t('products.statusOutOfStock', { defaultValue: 'Нет в наличии' }),
    },
  ];

  return (
    <Form
      layout="vertical"
      requiredMark
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          const modal = e.currentTarget.closest('.ant-modal-content');
          const submitBtn = modal?.querySelector<HTMLButtonElement>('.ant-btn-primary');
          submitBtn?.click();
        }
      }}
    >
      <Form.Item
        label={t('products.colBarcode', { defaultValue: 'Штрих-код' })}
        validateStatus={errors.barcode ? 'error' : ''}
        help={errors.barcode?.message}
      >
        <Controller
          name="barcode"
          control={control}
          render={({ field }) => (
            <Input {...field} placeholder="4870001234567" disabled={isEditing} />
          )}
        />
      </Form.Item>

      <Form.Item
        label={t('products.colName', { defaultValue: 'Название' })}
        validateStatus={errors.name ? 'error' : ''}
        help={errors.name?.message}
      >
        <Controller
          name="name"
          control={control}
          render={({ field }) => <Input {...field} placeholder="Мороженое «Пломбир»" />}
        />
      </Form.Item>

      <Form.Item
        label={t('products.colBoxQty', { defaultValue: 'Кол-во в коробке' })}
        validateStatus={errors.boxQuantity ? 'error' : ''}
        help={errors.boxQuantity?.message}
      >
        <Controller
          name="boxQuantity"
          control={control}
          render={({ field }) => (
            <InputNumber {...field} min={1} style={{ width: '100%' }} placeholder="24" />
          )}
        />
      </Form.Item>

      <Form.Item
        label={t('products.colExpiration', { defaultValue: 'Срок годности' })}
        validateStatus={errors.expirationDate ? 'error' : ''}
        help={errors.expirationDate?.message}
      >
        <Controller
          name="expirationDate"
          control={control}
          render={({ field }) => (
            <DatePicker {...field} style={{ width: '100%' }} format="DD.MM.YYYY" />
          )}
        />
      </Form.Item>

      <Form.Item
        label={t('products.colFactoryPrice', { defaultValue: 'Цена завода' })}
        validateStatus={errors.factoryPrice ? 'error' : ''}
        help={
          errors.factoryPrice?.message ??
          t('products.hintFactoryPrice', { defaultValue: 'За 1 штуку (не за коробку)' })
        }
      >
        <Space.Compact style={{ width: '100%' }}>
          <Controller
            name="factoryPrice"
            control={control}
            render={({ field }) => <InputNumber {...field} min={0} style={{ flex: 1 }} />}
          />
          <Button disabled>{t('common.currency', { defaultValue: 'сом' })}</Button>
        </Space.Compact>
      </Form.Item>

      <Form.Item
        label={t('products.colStatus', { defaultValue: 'Статус' })}
        validateStatus={errors.status ? 'error' : ''}
        help={errors.status?.message}
      >
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              placeholder={t('products.colStatus', { defaultValue: 'Выберите статус' })}
            >
              {STATUS_OPTIONS.map((o) => (
                <Option key={o.value} value={o.value}>
                  {o.label}
                </Option>
              ))}
            </Select>
          )}
        />
      </Form.Item>
    </Form>
  );
}

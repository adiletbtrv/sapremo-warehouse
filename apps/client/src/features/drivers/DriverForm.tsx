import { useEffect } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Input, Button, Space, Alert } from 'antd';
import type { Driver } from '@/types';
import { useTranslation } from 'react-i18next';
import { getDriverSchema, type DriverFormData } from './driverForm.schema';

interface DriverFormProps {
  driver?: Driver | null;
  onSubmit: (data: DriverFormData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export default function DriverForm({
  driver,
  onSubmit,
  onCancel,
  isLoading = false,
}: DriverFormProps) {
  const { t } = useTranslation();
  const driverSchema = getDriverSchema(t);
  const isEditing = !!driver;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema) as Resolver<DriverFormData>,
    defaultValues: {
      fullName: driver?.fullName ?? '',
      carNumber: driver?.carNumber ?? driver?.vehicleNumber ?? '',
      phone: '',
      password: '',
      currentDebt: driver?.currentDebt ?? 0,
    },
  });

  useEffect(() => {
    reset({
      fullName: driver?.fullName ?? '',
      carNumber: driver?.carNumber ?? driver?.vehicleNumber ?? '',
      phone: '',
      password: '',
      currentDebt: driver?.currentDebt ?? 0,
    });
  }, [driver, reset]);

  const handleFormSubmit = async (data: DriverFormData) => {
    await onSubmit(data);
  };

  return (
    <Form
      layout="vertical"
      onFinish={() => {
        void handleSubmit(handleFormSubmit)();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          void handleSubmit(handleFormSubmit)();
        }
      }}
    >
      {!isEditing && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('drivers.infoNewDriver', {
            defaultValue:
              'Для регистрации нового водителя заполните все поля. Водитель получит доступ в мобильное приложение по номеру телефона и паролю.',
          })}
        />
      )}

      {/* ФИО */}
      <Form.Item
        label={t('drivers.lblFullName', { defaultValue: 'ФИО' })}
        required
        validateStatus={errors.fullName ? 'error' : ''}
        help={errors.fullName?.message}
      >
        <Controller
          name="fullName"
          control={control}
          render={({ field }) => (
            <Input
              placeholder={t('drivers.phFullName', { defaultValue: 'Введите ФИО' })}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
            />
          )}
        />
      </Form.Item>

      {/* Номер машины (carNumber) */}
      <Form.Item
        label={t('drivers.lblVehicleNumber', { defaultValue: 'Номер машины' })}
        validateStatus={errors.carNumber ? 'error' : ''}
        help={errors.carNumber?.message}
      >
        <Controller
          name="carNumber"
          control={control}
          render={({ field }) => (
            <Input
              placeholder={t('drivers.phVehicleNumber', { defaultValue: 'Например: 01KG123ABC' })}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
            />
          )}
        />
      </Form.Item>

      {/* Номер телефона — нужен для входа в мобильное приложение */}
      <Form.Item
        label={t('drivers.lblPhone', { defaultValue: 'Номер телефона' })}
        required={!isEditing}
        validateStatus={errors.phone ? 'error' : ''}
        help={
          errors.phone?.message ?? t('drivers.hintPhone', { defaultValue: 'Формат: +996700123456' })
        }
      >
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <Input
              placeholder="+996700123456"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              disabled={isEditing}
            />
          )}
        />
      </Form.Item>

      {/* Пароль — только при создании */}
      {!isEditing && (
        <Form.Item
          label={t('drivers.lblPassword', { defaultValue: 'Пароль' })}
          required
          validateStatus={errors.password ? 'error' : ''}
          help={
            errors.password?.message ??
            t('drivers.hintPassword', { defaultValue: 'Минимум 8 символов' })
          }
        >
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <Input.Password
                placeholder={t('drivers.phPassword', { defaultValue: 'Минимум 8 символов' })}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
              />
            )}
          />
        </Form.Item>
      )}

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={isLoading}>
            {isEditing
              ? t('common.save', { defaultValue: 'Сохранить' })
              : t('common.add', { defaultValue: 'Добавить' })}
          </Button>
          {onCancel && (
            <Button onClick={onCancel}>{t('common.cancel', { defaultValue: 'Отмена' })}</Button>
          )}
        </Space>
      </Form.Item>
    </Form>
  );
}

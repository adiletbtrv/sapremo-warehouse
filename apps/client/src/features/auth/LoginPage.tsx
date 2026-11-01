import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, Input, Button, Card, Typography, App, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage, type AuthResponse } from './types';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

const getLoginSchema = (t: (key: string, options?: { defaultValue?: string }) => string) =>
  z.object({
    username: z
      .string()
      .min(1, t('auth.errUsernameRequired', { defaultValue: 'Введите логин' }))
      .min(
        5,
        t('auth.errUsernameMin', { defaultValue: 'Логин должен содержать минимум 5 символов' }),
      ),
    password: z
      .string()
      .min(1, t('auth.errPasswordRequired', { defaultValue: 'Введите пароль' }))
      .min(
        5,
        t('auth.errPasswordMin', { defaultValue: 'Пароль должен содержать минимум 5 символов' }),
      ),
  });

type LoginFormData = z.infer<ReturnType<typeof getLoginSchema>>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
  const { message } = App.useApp();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(getLoginSchema(t)),
    defaultValues: {
      username: 'warehouse_admin',
      password: 'password123',
    },
  });

  const onSubmit = async (values: LoginFormData) => {
    setServerError(null);
    try {
      const { factoryClient } = await import('@/api/client');

      const response = await factoryClient.post<AuthResponse>('/auth/login', {
        username: values.username,
        password: values.password,
      });
      const data = response.data;

      if (data?.access && data?.user) {
        const whId = data.user.warehouse_id;
        const isSuperuser = data.user.is_superuser ?? false;
        const role = data.user.role ?? '';

        if (!whId && (role === 'ADMIN' || isSuperuser)) {
          console.warn('[Login] Admin user has no warehouseId assigned yet.');
        }

        login(data.access, data.refresh ?? '', {
          id: String(data.user.id ?? ''),
          username: data.user.username ?? '',
          fullName: data.user.full_name ?? data.user.username ?? '',
          role,
          warehouseId: whId,
          isSuperuser,
        });

        queryClient.clear();

        void message.success(t('auth.loginSuccess', 'Вы успешно вошли в систему'));
        void navigate('/dashboard', { replace: true });
      } else {
        const errorMsg = t('auth.invalidData', 'Неверные данные от сервера');
        setServerError(errorMsg);
        void message.error(errorMsg);
      }
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(
        error,
        t('auth.invalidCredentials', 'Неверный логин или пароль'),
      );
      setServerError(errorMsg);
      void message.error(errorMsg);
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" styles={{ body: { padding: '32px 24px' } }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img
            src="/logo.svg"
            alt="Sapremo Logo"
            style={{
              height: 80,
              marginBottom: 10,
              objectFit: 'contain',
            }}
          />
          <Title level={5} style={{ margin: 0 }} type="secondary">
            {t('auth.subtitle', { defaultValue: 'Система управления складом' })}
          </Title>
        </div>

        {serverError && (
          <Alert
            message={serverError}
            type="error"
            showIcon
            closable
            onClose={() => setServerError(null)}
            style={{ marginBottom: 20 }}
          />
        )}

        <Form
          name="login"
          size="large"
          layout="vertical"
          onFinish={() => {
            void handleSubmit(onSubmit)();
          }}
        >
          <Form.Item
            validateStatus={errors.username ? 'error' : ''}
            help={errors.username?.message}
          >
            <Controller
              name="username"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  prefix={<UserOutlined />}
                  placeholder={t('auth.usernamePlaceholder', { defaultValue: 'Логин' })}
                />
              )}
            />
          </Form.Item>
          <Form.Item
            validateStatus={errors.password ? 'error' : ''}
            help={errors.password?.message}
          >
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined />}
                  placeholder={t('auth.passwordPlaceholder', { defaultValue: 'Пароль' })}
                />
              )}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isSubmitting}>
              {t('auth.loginButton', { defaultValue: 'Войти' })}
            </Button>
            {import.meta.env.DEV && (
              <Button
                type="dashed"
                block
                style={{ marginTop: 12, borderColor: '#FAAD14', color: '#FAAD14' }}
                onClick={() => {
                  login('dev-access-token', 'mock_refresh_token', {
                    id: 'dev-user-id',
                    username: 'dev_admin',
                    fullName: 'Разработчик (Offline)',
                    role: 'WAREHOUSE_MANAGER',
                    warehouseId: '00000000-0000-0000-0000-000000000001', // ID для тестового склада
                    isSuperuser: true,
                  });
                  queryClient.clear();
                  void message.success(
                    t('auth.loginDevSuccess', 'Вход в режиме разработчика (Офлайн)'),
                  );
                  void navigate('/dashboard', { replace: true });
                }}
              >
                [DEV]{' '}
                {t('auth.loginDevButton', { defaultValue: 'Войти без сервера (Offline Mode)' })}
              </Button>
            )}
          </Form.Item>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Typography.Text type="secondary">
              {t('auth.noAccountHint', {
                defaultValue: 'Если у вас нет учетной записи, обратитесь к администратору завода.',
              })}
            </Typography.Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}

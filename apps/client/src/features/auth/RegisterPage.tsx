import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const getRegisterSchema = (t: (key: string, options?: { defaultValue?: string }) => string) =>
  z
    .object({
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
      confirmPassword: z
        .string()
        .min(
          1,
          t('auth.errConfirmPasswordRequired', { defaultValue: 'Пожалуйста, подтвердите пароль' }),
        ),
    })
    .refine((data) => data.password === data.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth.errPasswordsDoNotMatch', { defaultValue: 'Пароли не совпадают' }),
    });

type RegisterFormData = z.infer<ReturnType<typeof getRegisterSchema>>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { t } = useTranslation();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(getRegisterSchema(t)),
  });

  const onSubmit = async (_values: RegisterFormData) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      void message.success(
        t('auth.registerSuccess', 'Регистрация прошла успешно! Теперь вы можете войти.'),
      );
      void navigate('/login');
    } catch {
      void message.error(t('auth.registerError', 'Произошла ошибка при регистрации'));
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" styles={{ body: { padding: '32px 24px' } }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>
            {t('auth.registerTitle', 'Регистрация')}
          </Title>
          <Text type="secondary">{t('auth.subtitle', 'Система управления складом')}</Text>
        </div>

        <Form
          layout="vertical"
          onFinish={() => {
            void handleSubmit(onSubmit)();
          }}
        >
          <Form.Item
            label={t('auth.lblUsername', { defaultValue: 'Логин' })}
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
                  placeholder={t('auth.phRegisterUsername', { defaultValue: 'Придумайте логин' })}
                  size="large"
                />
              )}
            />
          </Form.Item>
          <Form.Item
            label={t('auth.lblPassword', { defaultValue: 'Пароль' })}
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
                  placeholder={t('auth.phRegisterPassword', { defaultValue: 'Минимум 6 символов' })}
                  size="large"
                />
              )}
            />
          </Form.Item>
          <Form.Item
            label={t('auth.lblConfirmPassword', { defaultValue: 'Подтверждение пароля' })}
            validateStatus={errors.confirmPassword ? 'error' : ''}
            help={errors.confirmPassword?.message}
          >
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined />}
                  placeholder={t('auth.phConfirmPassword', { defaultValue: 'Повторите пароль' })}
                  size="large"
                />
              )}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isSubmitting}>
              {t('auth.btnRegister', { defaultValue: 'Зарегистрироваться' })}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Typography.Text type="secondary">
              {t('auth.haveAccount', { defaultValue: 'Уже есть аккаунт?' })}{' '}
              <a
                onClick={() => {
                  void navigate('/login');
                }}
              >
                {t('auth.btnBackToLogin', { defaultValue: 'Войти' })}
              </a>
            </Typography.Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}

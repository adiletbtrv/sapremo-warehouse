import { useState, useRef, useMemo } from 'react';
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import type { TabsProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DollarOutlined,
  PlusCircleOutlined,
  UserOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '@/db/schema';
import { useDrivers } from '@/hooks/useDrivers';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { warehouseClient } from '@/api/client';
import { cancelFailedPayment, retryFailedSyncs, useSyncStore } from '@/store/syncStore';
import { mapApiError } from '@/utils/errorMapper';
import { roundCurrency } from '@/utils/money';
import type { Transaction, TransactionType } from '@/types';
import {
  getPaymentSchema,
  getDefaultValues,
  type PaymentType,
  type PaymentFormValues,
  type ValidPaymentValues,
} from './payment.schema';

const { Title, Text } = Typography;

export default function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const isSavingRef = useRef(false);
  const [paymentType, setPaymentType] = useState<PaymentType>('factory_payment');

  const drivers = useDrivers();
  const allDrivers = useLiveQuery(() => db.drivers.toArray(), [], []);
  const driversMap = useMemo(() => new Map(allDrivers.map((d) => [String(d.id), d])), [allDrivers]);
  const stats = useDashboardStats();
  const factoryDebt = stats?.factoryDebt ?? 0;
  const currencyFormatter = new Intl.NumberFormat(
    i18n.language === 'ky' || i18n.language === 'kg' ? 'ky-KG' : 'ru-RU',
  );

  const transactions = useLiveQuery(
    () =>
      db.transactions
        .orderBy('date')
        .reverse()
        .filter((t) => !t.isArchived)
        .toArray(),
    [],
    [] as Transaction[],
  );

  const syncPaymentTasks = useLiveQuery(
    () =>
      db.syncQueue
        .where('action')
        .equals('CREATE_PAYMENT')
        .and((t) => t.status === 'failed' || t.status === 'pending')
        .toArray(),
    [],
    [],
  );

  const failedPaymentTasks = useMemo(
    () => syncPaymentTasks?.filter((t) => t.status === 'failed') ?? [],
    [syncPaymentTasks],
  );
  const hasFailed = failedPaymentTasks.length > 0;
  const failedCount = failedPaymentTasks.length;
  const rawLastError = failedPaymentTasks[0]?.lastError;

  const failedLastError = useMemo(() => {
    if (!rawLastError) return '';
    if (
      rawLastError.includes('409') ||
      rawLastError.includes('Недостаточно средств') ||
      rawLastError.includes('Client Error 409')
    ) {
      const cleaned = rawLastError
        .replace(/^Client Error 409:\s*/i, '')
        .replace(/Request failed with status code 409/i, '')
        .trim();
      return cleaned.length > 0
        ? cleaned
        : t('payment.errors.insufficient_funds', {
            defaultValue: 'Недостаточно средств в кассе',
          });
    }
    return mapApiError(rawLastError);
  }, [rawLastError, t]);

  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      const res = await retryFailedSyncs();
      if (res.failed > 0) {
        const errorMsg =
          res.lastError && !res.lastError.includes('Request failed with status code')
            ? res.lastError
            : t('payment.errors.insufficient_funds', {
                defaultValue: 'Недостаточно средств в кассе',
              });
        void message.error(errorMsg);
      } else {
        void message.success(
          t('payment.messages.syncSuccess', {
            defaultValue: 'Все платежи успешно синхронизированы!',
          }),
        );
      }
    } catch (err) {
      void message.error(mapApiError(err));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCancelFailed = async () => {
    try {
      await cancelFailedPayment();
      void message.info(
        t('payment.messages.cancelSuccess', {
          defaultValue: 'Неотправленный платёж отменён и удалён из локальной базы',
        }),
      );
    } catch (err) {
      void message.error(mapApiError(err));
    }
  };

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<PaymentFormValues, undefined, ValidPaymentValues>({
    resolver: (data, context, options) =>
      zodResolver(getPaymentSchema(paymentType, t, stats?.cashBalance))(data, context, options),
    defaultValues: getDefaultValues(),
  });

  const openModal = (type: PaymentType) => {
    setPaymentType(type);
    clearErrors();
    reset(getDefaultValues());
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    reset(getDefaultValues());
  };

  const handlePaymentTypeChange = (key: string) => {
    setPaymentType(key as PaymentType);
    clearErrors();
    reset(getDefaultValues(getValues('date')));
  };

  const addToQueue = useSyncStore((state) => state.addToQueue);

  const onSubmit = async (values: ValidPaymentValues) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setLoading(true);
    const operationId = crypto.randomUUID();
    const rawMethod = (values.paymentMethod ?? 'cash').toUpperCase();
    const method = rawMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH';
    const roundedAmount = roundCurrency(values.amount);
    const selectedDriver = drivers.find((d) => String(d.id) === String(values.driverId));
    const transaction: Transaction = {
      id: operationId,
      type: paymentType,
      amount: roundedAmount,
      date: values.date.toISOString(),
      paymentMethod: values.paymentMethod,
      comment: values.comment,
      ...(paymentType === 'driver_payment' && {
        driverId: values.driverId,
        driverName: selectedDriver?.fullName,
      }),
    };

    try {
      await db.transaction('rw', db.transactions, db.drivers, async () => {
        const existing = await db.transactions.get(transaction.id);
        if (existing) return;

        await db.transactions.put(transaction);
        if (transaction.type === 'driver_payment' && transaction.driverId) {
          const driver = await db.drivers.get(transaction.driverId);
          if (driver) {
            await db.drivers.update(transaction.driverId, {
              currentDebt: Math.max(0, driver.currentDebt - transaction.amount),
            });
          }
        }
      });

      try {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          let serverId: string | null = null;
          if (paymentType === 'driver_payment') {
            const res = await warehouseClient.post<Record<string, unknown>>(
              '/cashbox/driver-payment',
              {
                driverId: values.driverId,
                amount: roundedAmount,
                paymentMethod: method,
                comment: values.comment ?? null,
              },
              { headers: { 'Idempotency-Key': operationId } },
            );
            const resData = res?.data;
            const rawId =
              resData?.id ??
              resData?.transactionId ??
              (resData?.transaction as { id?: unknown } | undefined)?.id;
            serverId = rawId ? String(rawId) : null;
          } else {
            const res = await warehouseClient.post<Record<string, unknown>>(
              '/cashbox/factory-payment',
              {
                amount: roundedAmount,
                paymentMethod: method,
                comment: values.comment ?? null,
              },
              { headers: { 'Idempotency-Key': operationId } },
            );
            const resData = res?.data;
            const rawId =
              resData?.id ??
              resData?.transactionId ??
              (resData?.transaction as { id?: unknown } | undefined)?.id;
            serverId = rawId ? String(rawId) : null;
          }

          if (serverId && serverId !== operationId) {
            await db.transaction('rw', db.transactions, async () => {
              const existing = await db.transactions.get(operationId);
              if (existing) {
                await db.transactions.delete(operationId);
                await db.transactions.put({ ...existing, id: serverId });
              }
            });
          }
        } else {
          throw new Error('Offline');
        }
      } catch {
        await addToQueue(
          {
            action: 'CREATE_PAYMENT',
            payload: transaction,
          },
          operationId,
        );
        void message.info(
          t('payment.messages.offline_success', {
            defaultValue: 'Платеж сохранен локально и будет отправлен при подключении',
          }),
        );
        closeModal();
        return;
      }

      void message.success(
        paymentType === 'driver_payment'
          ? t('payment.messages.driver_success', 'Оплата от водителя принята')
          : t('payment.messages.factory_success', 'Оплата заводу сохранена'),
      );

      closeModal();
    } catch (err: unknown) {
      void message.error(
        mapApiError(err, t('payment.messages.save_error', 'Не удалось сохранить платеж')),
      );
    } finally {
      setLoading(false);
      isSavingRef.current = false;
    }
  };

  const columns: ColumnsType<Transaction> = [
    {
      title: t('history.columns.date', 'Дата'),
      dataIndex: 'date',
      key: 'date',
      width: 160,
      render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('history.columns.type', 'Тип операции'),
      dataIndex: 'type',
      key: 'type',
      width: 180,
      render: (type: TransactionType) =>
        type === 'driver_payment' ? (
          <Tag icon={<ArrowDownOutlined />} color="green">
            {t('payment.types.driver_payment', 'Приход (Водитель)')}
          </Tag>
        ) : (
          <Tag icon={<ArrowUpOutlined />} color="volcano">
            {t('payment.types.factory_payment', 'Расход (Завод)')}
          </Tag>
        ),
    },
    {
      title: t('history.columns.counterparty', 'Контрагент / ФИО'),
      key: 'counterparty',
      render: (_: undefined, record: Transaction) => {
        if (record.type === 'driver_payment') {
          let driverFullName = record.driverName;
          if (!driverFullName && record.driverId) {
            const driver =
              driversMap.get(String(record.driverId)) ??
              allDrivers.find((d) => String(d.id) === String(record.driverId)) ??
              drivers.find((d) => String(d.id) === String(record.driverId));
            if (driver) driverFullName = driver.fullName;
          }
          if (!driverFullName && record.comment) {
            const match = record.comment.match(/(?:от|водител[яе])\s+([А-Яа-яA-Za-z\s]+)/i);
            if (match?.[1]) driverFullName = match[1].trim();
          }

          return (
            <Space size={6}>
              <UserOutlined style={{ color: '#1890ff' }} />
              <span style={{ fontWeight: 500 }}>
                {driverFullName ? driverFullName : t('payment.counterparty.driver', 'Водитель')}
              </span>
            </Space>
          );
        }
        return <Tag color="volcano">{t('payment.counterparty.factory', 'Завод')}</Tag>;
      },
    },

    {
      title: t('history.columns.amount', 'Сумма'),
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      align: 'right',
      render: (amount: number) => (
        <b>
          {currencyFormatter.format(amount)} {t('currency.som', 'сом')}
        </b>
      ),
    },
    {
      title: t('history.columns.method', 'Способ'),
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 120,
      render: (method: string) => {
        const labels: Record<string, string> = {
          cash: t('payment.methods.cash', 'Наличные'),
          transfer: t('payment.methods.transfer', 'Перевод'),
          card: t('payment.methods.card', 'Карта'),
        };
        return labels[method] ?? method;
      },
    },
    {
      title: t('history.columns.comment', 'Комментарий'),
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
    },
  ];

  const tabItems: TabsProps['items'] = [
    { key: 'factory_payment', label: t('payment.tabs.factory_payment', 'Оплата заводу') },
    { key: 'driver_payment', label: t('payment.tabs.driver_payment', 'Приём от водителя') },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className="page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t('sidebar.payments', 'Касса')}
          </Title>
          <Text type="secondary">
            {t('payment.subtitles.financial_flow', 'Движение денежных средств')}
          </Text>
        </div>

        <Space size="middle" wrap>
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            onClick={() => openModal('driver_payment')}
            size="large"
          >
            {t('payment.actions.accept_driver', 'Принять от водителя')}
          </Button>

          <Button
            icon={<DollarOutlined />}
            onClick={() => openModal('factory_payment')}
            size="large"
          >
            {t('payment.actions.pay_factory', 'Оплатить заводу')}
          </Button>
        </Space>
      </div>

      {hasFailed && (
        <Alert
          message={t('payment.syncFailed', {
            count: failedCount,
            defaultValue: `${failedCount} платёж(а) не удалось синхронизировать с сервером.`,
          })}
          description={
            <div style={{ marginTop: 6 }}>
              {failedLastError && (
                <div style={{ marginBottom: 8, color: '#cf1322', fontWeight: 500 }}>
                  {t('common.reason', 'Причина')}: {failedLastError}
                </div>
              )}
              <Space size="small" wrap>
                <Button
                  size="small"
                  type="primary"
                  danger
                  loading={isRetrying}
                  onClick={() => void handleRetryFailed()}
                >
                  {t('common.retry', { defaultValue: 'Повторить' })}
                </Button>
                <Button size="small" onClick={() => void handleCancelFailed()}>
                  {t('payment.actions.cancel_failed', { defaultValue: 'Отменить платёж' })}
                </Button>
              </Space>
            </div>
          }
          type="error"
          showIcon
        />
      )}

      <Table<Transaction>
        rowKey="id"
        columns={columns}
        dataSource={transactions}
        pagination={{ pageSize: 15, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('history.empty', 'Транзакции пока не зарегистрированы') }}
      />

      <Modal
        centered
        title={
          paymentType === 'driver_payment'
            ? t('payment.tabs.driver_payment', 'Приём от водителя')
            : t('payment.tabs.factory_payment', 'Оплата заводу')
        }
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <Tabs
          type="card"
          activeKey={paymentType}
          onChange={handlePaymentTypeChange}
          style={{ marginBottom: 20 }}
          items={tabItems}
        />

        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              (e.target as HTMLElement).tagName !== 'TEXTAREA'
            ) {
              e.preventDefault();
              void handleSubmit(onSubmit)(e);
            }
          }}
        >
          {paymentType === 'driver_payment' && (
            <div style={{ marginBottom: 16 }}>
              <Text style={{ display: 'block', marginBottom: 8 }}>
                {t('payment.labels.driver', 'Водитель')}
              </Text>
              <Controller
                name="driverId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onChange={field.onChange}
                    size="large"
                    placeholder={t('payment.placeholders.driver_search', 'Поиск водителя...')}
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    suffixIcon={<UserOutlined />}
                    options={drivers.map((driver) => ({
                      value: driver.id,
                      label: `${driver.fullName} (${t('payment.labels.debt', 'Долг')}: ${currencyFormatter.format(driver.currentDebt)} ${t('currency.som', 'сом')})`,
                    }))}
                  />
                )}
              />
              {errors.driverId && (
                <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
                  {errors.driverId.message}
                </Text>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <Text style={{ display: 'block', marginBottom: 8 }}>
              {paymentType === 'driver_payment'
                ? t('payment.labels.amount_received', 'Принятая сумма (сом)')
                : t('payment.labels.amount_paid', 'Сумма оплаты (сом)')}
            </Text>
            <Controller
              name="amount"
              control={control}
              render={({ field }) => (
                <InputNumber
                  value={field.value as number | null}
                  size="large"
                  style={{ width: '100%' }}
                  prefix={<DollarOutlined />}
                  onChange={(value) => {
                    if (typeof value === 'number') {
                      field.onChange(value);
                    } else {
                      field.onChange(undefined);
                    }
                  }}
                />
              )}
            />
            {errors.amount && (
              <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
                {errors.amount.message}
              </Text>
            )}
            {paymentType === 'factory_payment' && (
              <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
                <span
                  style={{
                    fontWeight: 500,
                    color: (stats?.cashBalance ?? 0) <= 0 ? '#faad14' : undefined,
                  }}
                >
                  {t('payment.hints.available_cash', {
                    defaultValue: 'В кассе: {{cash}} сом',
                    cash: currencyFormatter.format(Math.max(0, stats?.cashBalance ?? 0)),
                  })}
                </span>
                {' · '}
                {factoryDebt > 0
                  ? t('payment.hints.factoryDebt', {
                      defaultValue: 'Текущий долг перед заводом: {{amount}} сом',
                      amount: currencyFormatter.format(factoryDebt),
                    })
                  : factoryDebt < 0
                    ? t('payment.hints.factoryOverpay', {
                        defaultValue: 'Переплата заводу: {{amount}} сом',
                        amount: currencyFormatter.format(Math.abs(factoryDebt)),
                      })
                    : t('payment.hints.factoryNoDebt', {
                        defaultValue: 'Долг перед заводом отсутствует',
                      })}
              </Text>
            )}
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <div style={{ marginBottom: 16 }}>
                <Text style={{ display: 'block', marginBottom: 8 }}>
                  {t('payment.labels.date', 'Дата операции')}
                </Text>
                <Controller
                  name="date"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      size="large"
                      style={{ width: '100%' }}
                      value={field.value ? dayjs(field.value) : null}
                      onChange={(value) => field.onChange(value?.toDate())}
                    />
                  )}
                />
                {errors.date && (
                  <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
                    {errors.date.message}
                  </Text>
                )}
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ marginBottom: 16 }}>
                <Text style={{ display: 'block', marginBottom: 8 }}>
                  {t('payment.labels.payment_method', 'Способ оплаты')}
                </Text>
                <Controller
                  name="paymentMethod"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onChange={field.onChange}
                      size="large"
                      style={{ width: '100%' }}
                      options={[
                        { value: 'cash', label: t('payment.methods.cash', 'Наличные') },
                        { value: 'transfer', label: t('payment.methods.transfer', 'Перевод') },
                      ]}
                    />
                  )}
                />
              </div>
            </Col>
          </Row>

          <div style={{ marginBottom: 24 }}>
            <Text style={{ display: 'block', marginBottom: 8 }}>
              {t('payment.labels.comment', 'Комментарий')}
            </Text>
            <Controller
              name="comment"
              control={control}
              render={({ field }) => (
                <Input.TextArea
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  rows={3}
                  placeholder={t('payment.placeholders.comment', 'Дополнительные сведения...')}
                />
              )}
            />
          </div>

          <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
            <Button onClick={closeModal}>{t('common.cancel', 'Отмена')}</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {paymentType === 'driver_payment'
                ? t('payment.buttons.receive_payment', 'Принять оплату')
                : t('common.buttons.save', 'Сохранить')}
            </Button>
          </Space>
        </form>
      </Modal>
    </Space>
  );
}

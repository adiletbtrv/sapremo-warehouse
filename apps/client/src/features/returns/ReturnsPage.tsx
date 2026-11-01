import { useState, useMemo } from 'react';
import { App, Typography, Table, Button, Space, Tag, Modal, Alert, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReturns, addReturn } from '@/hooks/useReturns';
import { useProducts } from '@/hooks/useProducts';
import { useDrivers } from '@/hooks/useDrivers';
import { db } from '@/db/schema';
import { retryFailedSyncs } from '@/store/syncStore';
import type { ProductReturn, ReturnItem, ReturnReason, Product, SyncTask } from '@/types';
import { useTranslation } from 'react-i18next';
import EmptyState from '@/components/EmptyState';
import ReturnForm from './ReturnForm';
import { getReturnSchema, type ReturnFormValues } from './returnForm.schema';
import { REASON_LABEL } from './reasons';
import { mapApiError } from '@/utils/errorMapper';
import { roundCurrency } from '@/utils/money';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Title, Text } = Typography;

const EMPTY_DEFAULTS: ReturnFormValues = {
  returnType: 'from_driver',
  driverId: '',
  items: [],
  notes: '',
};

export default function ReturnsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const returns = useReturns();
  const products = useProducts();
  const drivers = useDrivers();

  const syncReturnTasks = useLiveQuery(
    () =>
      db.syncQueue
        .where('action')
        .equals('CREATE_RETURN')
        .and((t) => t.status === 'failed' || t.status === 'pending')
        .toArray(),
    [],
    [],
  );

  const syncTaskByReturnId = useMemo(() => {
    const map = new Map<string, SyncTask['status']>();
    (syncReturnTasks ?? []).forEach((t) => {
      if (t.payload && (t.payload as ProductReturn).id) {
        map.set((t.payload as ProductReturn).id, t.status);
      }
    });
    return map;
  }, [syncReturnTasks]);

  const hasFailed = useMemo(
    () => syncReturnTasks?.some((t) => t.status === 'failed'),
    [syncReturnTasks],
  );
  const hasPending = useMemo(
    () => syncReturnTasks?.some((t) => t.status === 'pending'),
    [syncReturnTasks],
  );
  const failedCount = useMemo(
    () => syncReturnTasks?.filter((t) => t.status === 'failed').length ?? 0,
    [syncReturnTasks],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const methods = useForm<ReturnFormValues>({
    resolver: zodResolver(getReturnSchema(t)),
    defaultValues: EMPTY_DEFAULTS,
  });

  const openCreate = () => {
    methods.reset(EMPTY_DEFAULTS);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    methods.reset(EMPTY_DEFAULTS);
  };

  const onValid = async (values: ReturnFormValues) => {
    setSaving(true);
    try {
      const productsByBarcode = new Map<string, Product>(products.map((p) => [p.barcode, p]));
      const driver =
        values.returnType === 'from_driver'
          ? drivers.find((d) => d.id === values.driverId)
          : undefined;

      const items: ReturnItem[] = values.items.map((it) => {
        const product = productsByBarcode.get(it.barcode);
        const piecesPerBox = product?.boxQuantity ?? 1;
        const boxes = Number(it.boxCount) || 0;
        const loosePieces = Number(it.quantity) || 0;
        const totalQuantity = boxes * piecesPerBox + loosePieces;
        const unitPrice = product?.factoryPrice ?? 0;
        const amount = roundCurrency(totalQuantity * unitPrice);

        return {
          barcode: it.barcode,
          productName: product?.name ?? it.barcode,
          quantity: totalQuantity,
          boxCount: boxes,
          unitPrice: roundCurrency(unitPrice),
          amount,
          reason: it.reason,
        };
      });

      const totalAmount = roundCurrency(items.reduce((sum, it) => sum + it.amount, 0));

      const productReturn: ProductReturn = {
        id: crypto.randomUUID(),
        returnType: values.returnType,
        driverId: values.returnType === 'from_driver' ? values.driverId : undefined,
        driverName: driver?.fullName,
        date: dayjs().format('YYYY-MM-DD'),
        items,
        totalAmount,
        notes: values.notes?.trim() ?? undefined,
      };

      await addReturn(productReturn);
      const successMsg =
        values.returnType === 'to_factory'
          ? t('returns.msgSaveToFactorySuccess', {
              defaultValue:
                'Возврат на завод сохранён: остаток списан, долг перед заводом уменьшен',
            })
          : t('returns.msgSaveFromDriverSuccess', {
              defaultValue:
                'Возврат от водителя сохранён: остаток пополнен, долг водителя уменьшен',
            });
      void message.success(successMsg);
      closeModal();
    } catch (err) {
      void message.error(
        mapApiError(
          err,
          t('returns.msgCreateError', { defaultValue: 'Ошибка при создании возврата' }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ProductReturn> = [
    {
      title: t('returns.colDate', { defaultValue: 'Дата' }),
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: t('returns.colType', { defaultValue: 'Тип' }),
      key: 'returnType',
      width: 130,
      render: (_, r) => {
        const isToFactory = r.returnType === 'to_factory';
        return (
          <Tag color={isToFactory ? 'volcano' : 'blue'}>
            {isToFactory
              ? t('returns.typeToFactory', { defaultValue: 'На завод' })
              : t('returns.typeFromDriver', { defaultValue: 'От водителя' })}
          </Tag>
        );
      },
    },
    {
      title: t('returns.colParty', { defaultValue: 'Контрагент / Водитель' }),
      key: 'party',
      render: (_, r) => {
        if (r.returnType === 'to_factory') {
          return (
            <Tag color="orange" style={{ fontWeight: 500 }}>
              {t('returns.partyFactory', { defaultValue: 'Завод (Склад → Завод)' })}
            </Tag>
          );
        }
        return r.driverName ? (
          r.driverName
        ) : (
          <span style={{ color: token.colorTextQuaternary }}>—</span>
        );
      },
    },
    {
      title: t('returns.colItemsCount', { defaultValue: 'Товаров' }),
      key: 'itemsCount',
      width: 110,
      align: 'right',
      render: (_, r) => r.items.length,
    },
    {
      title: t('returns.colTotal', { defaultValue: 'Сумма' }),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 130,
      align: 'right',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: t('returns.colSyncStatus', 'Статус синхронизации'),
      key: 'syncStatus',
      width: 170,
      render: (_, r) => {
        const queueStatus = syncTaskByReturnId.get(r.id);
        const effectiveStatus = queueStatus ?? r.syncStatus ?? (r.isSynced ? 'synced' : 'pending');

        if (r.returnType === 'to_factory' && effectiveStatus === 'local_only') {
          return (
            <Tag color="cyan">{t('returns.statusLocal', { defaultValue: 'Склад (локально)' })}</Tag>
          );
        }
        if (effectiveStatus === 'pending') {
          return (
            <Tag color="orange">{t('returns.statusPending', { defaultValue: 'Ожидает' })}</Tag>
          );
        }
        if (effectiveStatus === 'failed') {
          return <Tag color="red">{t('returns.statusFailed', { defaultValue: 'Ошибка' })}</Tag>;
        }
        if (effectiveStatus === 'synced' || r.isSynced) {
          return (
            <Tag color="green">
              {t('returns.statusSynced', { defaultValue: 'Синхронизирован' })}
            </Tag>
          );
        }
        return <Tag color="orange">{t('returns.statusPending', { defaultValue: 'Ожидает' })}</Tag>;
      },
    },
  ];

  const expandedRowRender = (productReturn: ProductReturn) => (
    <Table<ReturnItem>
      className="nested-table"
      rowKey="barcode"
      size="small"
      pagination={false}
      dataSource={productReturn.items}
      columns={[
        {
          title: t('returns.colProduct', { defaultValue: 'Товар' }),
          dataIndex: 'productName',
          key: 'productName',
        },
        {
          title: t('returns.colQuantity', { defaultValue: 'Кол-во' }),
          dataIndex: 'quantity',
          key: 'quantity',
          align: 'right',
        },
        {
          title: t('returns.colBoxCount', { defaultValue: 'Коробки' }),
          dataIndex: 'boxCount',
          key: 'boxCount',
          align: 'right',
        },
        {
          title: t('returns.colTotal', { defaultValue: 'Сумма' }),
          dataIndex: 'amount',
          key: 'amount',
          align: 'right',
          render: (v: number) => <MoneyDisplay amount={v} />,
        },
        {
          title: t('returns.colReason', { defaultValue: 'Причина' }),
          dataIndex: 'reason',
          key: 'reason',
          render: (r: ReturnReason) => (
            <Tag>{t(`returns.reason_${r}`, { defaultValue: REASON_LABEL[r] ?? r })}</Tag>
          ),
        },
      ]}
    />
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className="page-header">
        <Title level={3} style={{ margin: 0 }}>
          {t('returns.title', { defaultValue: 'Возвраты' })}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('returns.btnNewReturn', { defaultValue: 'Новый возврат' })}
        </Button>
      </div>

      {hasFailed && (
        <Alert
          message={t('returns.syncFailed', {
            count: failedCount,
            defaultValue: `${failedCount} возврат(а) не удалось синхронизировать с сервером. Данные сохранены локально и будут отправлены при восстановлении связи.`,
          })}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => void retryFailedSyncs()}>
              {t('common.retry', { defaultValue: 'Повторить' })}
            </Button>
          }
        />
      )}
      {hasPending && !hasFailed && (
        <Alert
          message={t('returns.syncPending', {
            defaultValue: 'Возвраты ожидают синхронизации с сервером.',
          })}
          type="warning"
          showIcon
        />
      )}

      <Table<ProductReturn>
        rowKey="id"
        columns={columns}
        dataSource={returns}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('common.noData', { defaultValue: 'Возвратов пока нет' })}
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t('returns.btnNewReturn', { defaultValue: 'Новый возврат' })}
                </Button>
              }
            />
          ),
        }}
      />

      <Modal
        centered
        title={t('returns.modalTitle', { defaultValue: 'Новый возврат' })}
        open={modalOpen}
        onOk={() => {
          if (saving) return;
          void methods.handleSubmit(onValid)();
        }}
        onCancel={closeModal}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        okText={t('common.save', { defaultValue: 'Сохранить' })}
        cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
        width="90%"
        style={{ maxWidth: 900 }}
      >
        {products.length === 0 || drivers.length === 0 ? (
          <Text type="secondary">
            Для возврата нужны товары в каталоге и хотя бы один водитель.
          </Text>
        ) : (
          <FormProvider {...methods}>
            <ReturnForm products={products} drivers={drivers} />
          </FormProvider>
        )}
      </Modal>
    </Space>
  );
}

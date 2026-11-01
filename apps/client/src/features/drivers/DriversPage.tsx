import { useState } from 'react';
import { Table, Tag, Space, Button, Modal, App, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Driver } from '@/types';
import { useDriversPaginated, createDriver } from '@/hooks/useDrivers';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from 'react-i18next';
import DriverForm from './DriverForm';
import type { DriverFormData } from './driverForm.schema';
import EmptyState from '@/components/EmptyState';
import { mapApiError } from '@/utils/errorMapper';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

export default function DriversPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data: drivers, total, isLoading } = useDriversPaginated(page, pageSize);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const user = useAuthStore((s) => s.user);
  const warehouseId = user?.warehouseId ?? '';

  const openCreate = () => {
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const onCreate = async (data: DriverFormData) => {
    if (!warehouseId) {
      void message.error(
        t('drivers.errorNoWarehouse', {
          defaultValue: 'Не удалось определить склад текущего пользователя',
        }),
      );
      return;
    }
    setSaving(true);
    try {
      await createDriver({
        fullName: data.fullName,
        carNumber: data.carNumber ?? '',
        phone: data.phone ?? '',
        password: data.password ?? '',
        warehouseId,
      });
      void message.success(
        t('drivers.msgCreateSuccess', { defaultValue: 'Водитель успешно создан' }),
      );
      closeModal();
    } catch (err) {
      void message.error(
        mapApiError(
          err,
          t('drivers.msgCreateError', { defaultValue: 'Ошибка при создании водителя' }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };
  const columns: ColumnsType<Driver> = [
    {
      title: t('drivers.colFullName', { defaultValue: 'ФИО' }),
      dataIndex: 'fullName',
      key: 'fullName',
    },
    {
      title: t('drivers.colVehicleNumber', { defaultValue: 'Номер машины' }),
      key: 'carNumber',
      render: (_, record) => {
        const num = record.carNumber ?? record.vehicleNumber;
        return num ? num : <span style={{ color: token.colorTextQuaternary }}>—</span>;
      },
    },
    {
      title: t('drivers.colPhone', { defaultValue: 'Телефон' }),
      dataIndex: 'phone',
      key: 'phone',
      render: (val: string) => val || <span style={{ color: token.colorTextQuaternary }}>—</span>,
    },
    {
      title: t('drivers.colCurrentDebt', { defaultValue: 'Текущий долг' }),
      dataIndex: 'currentDebt',
      key: 'currentDebt',
      render: (val: number) => {
        const debt = val ?? 0;
        if (debt < 0) {
          return (
            <Typography.Text type="success" strong>
              {t('drivers.overpayment', { defaultValue: 'Переплата' })}:{' '}
              <MoneyDisplay amount={Math.abs(debt)} />
            </Typography.Text>
          );
        }
        return <MoneyDisplay amount={debt} strong />;
      },
    },
    {
      title: t('drivers.colStatus', { defaultValue: 'Статус' }),
      dataIndex: 'status',
      key: 'status',
      render: (val: string) =>
        val === 'INACTIVE' ? (
          <Tag color="red">{t('drivers.statusInactive', { defaultValue: 'Неактивен' })}</Tag>
        ) : (
          <Tag color="green">{t('drivers.statusActive', { defaultValue: 'Активен' })}</Tag>
        ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          {t('drivers.title', { defaultValue: 'Справочник водителей' })}
        </h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('drivers.addDriver', { defaultValue: 'Добавить водителя' })}
        </Button>
      </div>

      <Table<Driver>
        rowKey="id"
        columns={columns}
        dataSource={drivers}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        locale={{
          emptyText:
            total === 0 ? (
              <EmptyState
                description={t('drivers.emptyNoDrivers', { defaultValue: 'Водителей пока нет' })}
                action={
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    {t('drivers.addDriver', { defaultValue: 'Добавить водителя' })}
                  </Button>
                }
              />
            ) : (
              t('drivers.emptyNotFound', { defaultValue: 'Ничего не найдено' })
            ),
        }}
      />

      <Modal
        centered
        title={t('drivers.newTitle', { defaultValue: 'Новый водитель' })}
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        destroyOnHidden
      >
        <DriverForm onSubmit={onCreate} onCancel={closeModal} isLoading={saving} />
      </Modal>
    </Space>
  );
}

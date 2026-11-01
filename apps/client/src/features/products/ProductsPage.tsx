import { useMemo, useState, useDeferredValue, useCallback } from 'react';
import { App, Typography, Table, Input, Select, Button, Space, Tag, Modal, Popconfirm } from 'antd';
import { FileExcelOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useProductsPaginated, addProduct, updateProduct } from '@/hooks/useProducts';
import { db } from '@/db/schema';
import type { Product, ProductStatus } from '@/types';
import { exportToExcel } from '@/utils/exportExcel';
import EmptyState from '@/components/EmptyState';
import { usePermissions } from '@/hooks/usePermissions';
import { mapApiError } from '@/utils/errorMapper';
import ProductForm from './ProductForm';
import { getProductSchema, type ProductFormValues } from './productForm.schema';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Title } = Typography;

const EMPTY_DEFAULTS: Partial<ProductFormValues> = {
  barcode: '',
  name: '',
  boxQuantity: 1,
  factoryPrice: 0,
  status: 'active',
};

export default function ProductsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { can } = usePermissions();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const STATUS_META: Record<ProductStatus, { color: string; label: string }> = useMemo(
    () => ({
      active: { color: 'green', label: t('products.statusActive', { defaultValue: 'Активен' }) },
      inactive: {
        color: 'default',
        label: t('products.statusInactive', { defaultValue: 'Неактивен' }),
      },
      low_stock: {
        color: 'orange',
        label: t('products.statusLowStock', { defaultValue: 'Заканчивается' }),
      },
      no_stock: {
        color: 'red',
        label: t('products.statusOutOfStock', { defaultValue: 'Нет в наличии' }),
      },
    }),
    [t],
  );

  const STATUS_OPTIONS = useMemo(
    () =>
      (Object.keys(STATUS_META) as ProductStatus[]).map((value) => ({
        value,
        label: STATUS_META[value].label,
      })),
    [STATUS_META],
  );

  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);

  const {
    data: filtered,
    total,
    isLoading,
  } = useProductsPaginated(page, pageSize, deferredSearch, deferredStatusFilter);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const schema = useMemo(() => getProductSchema(t), [t]);

  const methods = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const openCreate = () => {
    setEditing(null);
    methods.reset(EMPTY_DEFAULTS);
    setModalOpen(true);
  };

  const openEdit = useCallback(
    (product: Product) => {
      setEditing(product);
      methods.reset({
        barcode: product.barcode,
        name: product.name,
        boxQuantity: product.boxQuantity,
        expirationDate: product.expirationDate ? dayjs(product.expirationDate) : undefined,
        factoryPrice: product.factoryPrice,
        status: product.status,
      });
      setModalOpen(true);
    },
    [methods],
  );

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    methods.reset(EMPTY_DEFAULTS);
  };

  const onValid = async (values: ProductFormValues) => {
    setSaving(true);
    try {
      const payload: Omit<Product, 'id'> = {
        ...values,
        expirationDate: dayjs(values.expirationDate).format('YYYY-MM-DD'),
        stockQuantity: editing?.stockQuantity ?? 0,
        batchNumber:
          editing?.batchNumber ??
          `BATCH-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      };

      if (editing) {
        const fresh =
          (await db.products.get(editing.id)) ??
          (await db.products.where('barcode').equals(editing.barcode).first());
        const targetId = fresh?.id ?? editing.id;

        const duplicate = await db.products.where('barcode').equals(values.barcode).first();
        if (duplicate && duplicate.id !== targetId) {
          void message.error(
            t('products.errDuplicateBarcode', {
              barcode: values.barcode,
              name: duplicate.name,
              defaultValue: `Штрих-код «${values.barcode}» уже используется товаром «${duplicate.name}»`,
            }),
          );
          setSaving(false);
          return;
        }

        const finalPayload: Record<string, unknown> = { ...payload };
        delete finalPayload.stockQuantity;
        await updateProduct(targetId, finalPayload);
        void message.success(
          t('products.msgUpdateSuccess', { defaultValue: 'Товар успешно обновлён' }),
        );
      } else {
        const duplicate = await db.products.where('barcode').equals(values.barcode).first();
        if (duplicate) {
          void message.error(
            t('products.errDuplicateBarcode', {
              barcode: values.barcode,
              name: duplicate.name,
              defaultValue: `Штрих-код «${values.barcode}» уже используется товаром «${duplicate.name}»`,
            }),
          );
          setSaving(false);
          return;
        }

        await addProduct({ id: crypto.randomUUID(), ...payload } as Product);
        void message.success(
          t('products.msgCreateSuccess', { defaultValue: 'Товар успешно добавлен' }),
        );
      }
      closeModal();
    } catch (err) {
      void message.error(
        mapApiError(
          err,
          t('products.msgSaveError', { defaultValue: 'Не удалось сохранить товар' }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      void message.info(t('products.msgNoExport', { defaultValue: 'Нет товаров для экспорта' }));
      return;
    }
    void exportToExcel(
      filtered,
      [
        {
          header: t('products.colBarcode', {
            defaultValue: t('products.barcode', t('products.barcode', 'Штрих-код')),
          }),
          value: (p) => p.barcode,
        },
        { header: t('products.colName', { defaultValue: 'Название' }), value: (p) => p.name },
        {
          header: t('products.colBoxQty', { defaultValue: 'Кол-во в коробке' }),
          value: (p) => p.boxQuantity,
        },
        {
          header: t('products.colExpiration', { defaultValue: 'Срок годности' }),
          value: (p) => (p.expirationDate ? dayjs(p.expirationDate).format('DD.MM.YYYY') : ''),
        },
        {
          header: `${t('products.colFactoryPrice', { defaultValue: 'Цена завода' })}, ${t('common.currency', { defaultValue: 'сом' })}`,
          value: (p) => p.factoryPrice,
        },
        {
          header: t('products.colStatus', { defaultValue: 'Статус' }),
          value: (p) => STATUS_META[p.status]?.label ?? p.status,
        },
      ],
      'tovary',
      t('products.title', { defaultValue: 'Справочник товаров' }),
    );
  };

  const columns: ColumnsType<Product> = useMemo(
    () => [
      {
        title: t('products.colBarcode', {
          defaultValue: t('products.barcode', t('products.barcode', 'Штрих-код')),
        }),
        dataIndex: 'barcode',
        key: 'barcode',
        width: 150,
      },
      {
        title: t('products.colName', { defaultValue: 'Название' }),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('products.colBoxQty', { defaultValue: 'Кол-во в коробке' }),
        dataIndex: 'boxQuantity',
        key: 'boxQuantity',
        width: 130,
        align: 'right',
      },
      {
        title: t('products.colExpiration', { defaultValue: 'Срок годности' }),
        dataIndex: 'expirationDate',
        key: 'expirationDate',
        width: 130,
        render: (d: string) => <DateDisplay date={d} />,
      },
      {
        title: t('products.colFactoryPrice', { defaultValue: 'Цена завода' }),
        dataIndex: 'factoryPrice',
        key: 'factoryPrice',
        width: 120,
        align: 'right',
        render: (v: number) => <MoneyDisplay amount={v} />,
      },
      {
        title: t('products.colStatus', { defaultValue: 'Статус' }),
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (s: ProductStatus) => (
          <Tag color={STATUS_META[s]?.color}>{STATUS_META[s]?.label ?? s}</Tag>
        ),
      },
      {
        title: t('products.colActions', { defaultValue: 'Действия' }),
        key: 'actions',
        width: 220,
        render: (_, product) => (
          <Space>
            {can('canEditProducts') && (
              <Button size="small" onClick={() => openEdit(product)}>
                {t('common.edit', { defaultValue: 'Редактировать' })}
              </Button>
            )}
            {can('canDeleteProducts') && product.status !== 'inactive' && (
              <Popconfirm
                title={t('products.archiveConfirmTitle', { defaultValue: 'Архивировать товар?' })}
                description={t('products.archiveConfirmDesc', {
                  defaultValue: 'Товар будет скрыт из основного списка',
                })}
                onConfirm={() => {
                  void (async () => {
                    try {
                      await updateProduct(product.id, { status: 'inactive' });
                      void message.success(
                        t('common.archiveSuccess', { defaultValue: 'Товар архивирован' }),
                      );
                    } catch (err) {
                      void message.error(
                        mapApiError(
                          err,
                          t('common.archiveError', {
                            defaultValue: 'Не удалось архивировать товар',
                          }),
                        ),
                      );
                    }
                  })();
                }}
                okText={t('common.yes', { defaultValue: 'Да' })}
                cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
              >
                <Button size="small" danger>
                  {t('common.archive', { defaultValue: 'Архивировать' })}
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [t, STATUS_META, openEdit, message, can],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className="page-header">
        <Title level={3} style={{ margin: 0 }}>
          {t('products.title', { defaultValue: 'Справочник товаров' })}
        </Title>
      </div>

      <div className="page-toolbar">
        <Space wrap>
          <Input.Search
            placeholder={t('products.searchPlaceholder', {
              defaultValue: 'Поиск по названию или штрих-коду',
            })}
            allowClear
            className="filter-input"
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={statusFilter}
            className="filter-select"
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: t('products.allStatuses', { defaultValue: 'Все статусы' }) },
              ...STATUS_OPTIONS,
            ]}
          />
        </Space>

        <Space wrap>
          <Button icon={<FileExcelOutlined />} onClick={handleExport}>
            {t('common.exportExcel', { defaultValue: 'Экспорт в Excel' })}
          </Button>
          {can('canEditProducts') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('products.addProduct', { defaultValue: 'Добавить товар' })}
            </Button>
          )}
        </Space>
      </div>

      <Table<Product>
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
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
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText:
            total === 0 && !search && statusFilter === 'all' ? (
              <EmptyState
                description={t('products.emptyNoProducts', { defaultValue: 'Товаров пока нет' })}
                action={
                  can('canEditProducts') ? (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                      {t('products.addProduct', { defaultValue: 'Добавить товар' })}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <EmptyState
                description={t('products.emptyNotFound', {
                  defaultValue: 'Ничего не найдено по заданным фильтрам',
                })}
              />
            ),
        }}
      />

      <Modal
        centered
        destroyOnHidden
        title={
          editing
            ? t('products.editTitle', { defaultValue: 'Редактировать товар' })
            : t('products.newTitle', { defaultValue: 'Новый товар' })
        }
        open={modalOpen}
        onOk={() => {
          if (saving) return;
          void methods.handleSubmit(onValid)();
        }}
        onCancel={closeModal}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        okText={t('common.save', { defaultValue: 'Сохранить' })}
        cancelText={t('common.cancel', {
          defaultValue: t('common.cancel', t('common.cancel', 'Отмена')),
        })}
      >
        <FormProvider {...methods}>
          <ProductForm isEditing={!!editing} />
        </FormProvider>
      </Modal>
    </Space>
  );
}

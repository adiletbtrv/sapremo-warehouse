import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography,
  Table,
  Space,
  Button,
  Input,
  Tag,
  Popconfirm,
  Modal,
  Form,
  Select,
  InputNumber,
  Checkbox,
  App,
} from 'antd';
import { AppstoreOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { adjustWarehouseStock } from '@/hooks/useStock';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { playFeedbackSound } from '@/utils/soundFeedback';
import type { Product } from '@/types';
import EmptyState from '@/components/EmptyState';

const { Title } = Typography;
const { Option } = Select;

export default function StockPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const rawProducts = useLiveQuery(() => db.products.toArray(), [], []);

  const allProducts = useMemo(() => rawProducts ?? [], [rawProducts]);
  const [search, setSearch] = useState('');

  const [showArchivedInModal, setShowArchivedInModal] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [form] = Form.useForm();

  const openAdd = () => {
    setEditingItem(null);
    setShowArchivedInModal(false);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (product: Product) => {
    setEditingItem(product);
    form.setFieldsValue({
      barcode: product.barcode,
      boxes: Math.floor(product.stockQuantity / (product.boxQuantity ?? 1)),
    });
    setModalVisible(true);
  };

  // Global barcode scanner on StockPage (when modals are closed)
  useBarcodeScanner({
    enabled: !modalVisible,
    onScan: (barcode) => {
      const found = allProducts.find((p) => p.barcode === barcode);
      if (found) {
        playFeedbackSound('success');
        openEdit(found);
        void message.info(
          t('stock.msgEditOpened', {
            defaultValue: 'Открыто редактирование: {{name}}',
            name: found.name,
          }),
        );
      } else {
        playFeedbackSound('error');
        void message.warning(
          t('stock.msgProductNotFound', {
            defaultValue: 'Товар с ШК [{{barcode}}] не найден. Нажмите «Добавить товар».',
            barcode,
          }),
        );
      }
    },
  });

  const stock = useMemo(
    () =>
      allProducts.filter((p) => p.stockQuantity > 0 && !p.isArchived && p.status !== 'inactive'),
    [allProducts],
  );

  const filtered = useMemo(() => {
    if (!search) return stock;
    const q = search.toLowerCase();
    return stock.filter((s) => s.name.toLowerCase().includes(q) || s.barcode.includes(q));
  }, [stock, search]);

  const handleSave = async () => {
    if (savingRef.current) return;
    try {
      const values = (await form.validateFields()) as { barcode: string; boxes: number };
      const product = allProducts.find((p) => p.barcode === values.barcode);
      if (!product) return;

      savingRef.current = true;
      setSaving(true);

      const piecesPerBox = product.boxQuantity ?? 1;
      const currentBoxes = Math.floor((product.stockQuantity ?? 0) / piecesPerBox);

      // Если редактируем — устанавливаем абсолютное значение.
      // Если добавляем товар — прибавляем количество сверху к текущему остатку.
      const targetBoxes = editingItem ? values.boxes : currentBoxes + values.boxes;
      const newStockQuantity = targetBoxes * piecesPerBox;

      // Если остаток не изменился, не делаем избыточный сетевой запрос
      if (targetBoxes === currentBoxes) {
        void message.info(t('stock.msgNoChange', 'Количество товара не изменилось'));
        setModalVisible(false);
        return;
      }

      await adjustWarehouseStock({
        productId: product.id,
        barcode: product.barcode,
        quantityBoxes: targetBoxes,
        quantityPieces: newStockQuantity,
        isNew: !editingItem && currentBoxes === 0,
        comment: editingItem
          ? `Корректировка остатка через веб [${targetBoxes > currentBoxes ? '+' : ''}${targetBoxes - currentBoxes} кор]`
          : `Пополнение остатка на складе (+${values.boxes} кор)`,
      });

      void message.success(t('stock.msgUpdated', 'Остатки успешно обновлены'));
      setModalVisible(false);
    } catch (e: unknown) {
      const err = e as { outOfDate?: boolean; errorFields?: unknown[] };
      if (!err?.outOfDate && err?.errorFields && err.errorFields.length > 0) {
        // Обычные ошибки валидации полей формы (пользователь не заполнил поле)
        return;
      }
      if (!err?.outOfDate) {
        console.error('[StockPage] Save failed:', e);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleRemove = async (product: Product) => {
    try {
      await adjustWarehouseStock({
        productId: product.id,
        barcode: product.barcode,
        quantityBoxes: 0,
        quantityPieces: 0,
        comment: 'Списание товара со склада через веб',
      });

      void message.success(t('stock.msgRemoved', 'Товар списан со склада'));
    } catch (e) {
      void message.error(t('stock.msgRemoveError', 'Ошибка при списании товара'));
    }
  };

  const modalProducts = useMemo(() => {
    const list = showArchivedInModal
      ? allProducts
      : allProducts.filter((p) => !p.isArchived && p.status === 'active');
    const seen = new Set<string>();
    return list.filter((p) => {
      const key = p.barcode || p.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allProducts, showArchivedInModal]);

  const columns: ColumnsType<Product> = [
    { title: t('products.barcode', 'Штрих-код'), dataIndex: 'barcode', key: 'barcode', width: 140 },
    { title: t('products.colName', 'Название'), dataIndex: 'name', key: 'name' },
    {
      title: t('stock.colBoxes', 'Коробок'),
      key: 'boxes',
      width: 120,
      align: 'right',
      render: (_, r) => {
        const boxes = Math.floor(r.stockQuantity / (r.boxQuantity || 1));
        return (
          <Space>
            {boxes}
            {boxes === 0 && <Tag color="red">{t('stock.tagNone', 'Нет')}</Tag>}
            {boxes > 0 && boxes <= 5 && <Tag color="orange">{t('stock.tagLow', 'Мало')}</Tag>}
          </Space>
        );
      },
    },
    {
      title: t('stock.colPcsPerBox', 'Шт/кор'),
      dataIndex: 'boxQuantity',
      key: 'boxQuantity',
      width: 90,
      align: 'right',
    },
    {
      title: t('stock.colTotalPcs', 'Итого штук'),
      dataIndex: 'stockQuantity',
      key: 'stockQuantity',
      width: 110,
      align: 'right',
    },
    {
      title: t('common.actions', 'Действия'),
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, r) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />
          <Popconfirm
            title={t('stock.confirmRemove', 'Точно удалить товар со склада?')}
            onConfirm={() => void handleRemove(r)}
            okText={t('common.yes', 'Да')}
            cancelText={t('common.no', 'Нет')}
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          <AppstoreOutlined style={{ marginRight: 10 }} />
          {t('stock.title', 'Склад (Остатки)')}
        </Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} className="shadow-btn">
            {t('stock.btnAddStock', 'Добавить товар на склад')}
          </Button>
        </Space>
      </div>

      <div className="page-toolbar" style={{ display: 'flex', gap: 16 }}>
        <Input.Search
          placeholder={t('stock.searchPlaceholder', 'Поиск по названию или штрих-коду')}
          allowClear
          className="filter-input"
          style={{ maxWidth: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table<Product>
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        locale={{
          emptyText: (
            <EmptyState description={t('stock.emptyText', 'Данных о складских остатках нет')} />
          ),
        }}
      />

      <Modal
        title={
          editingItem
            ? t('stock.modalTitleEdit', 'Изменить количество')
            : t('stock.btnAddStock', 'Добавить товар на склад')
        }
        open={modalVisible}
        onOk={() => void handleSave()}
        onCancel={() => setModalVisible(false)}
        confirmLoading={saving}
        okText={t('common.save', 'Сохранить')}
        cancelText={t('common.cancel', 'Отмена')}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              (e.target as HTMLElement).tagName !== 'TEXTAREA'
            ) {
              e.preventDefault();
              void handleSave();
            }
          }}
        >
          {!editingItem && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Checkbox
                checked={showArchivedInModal}
                onChange={(e) => setShowArchivedInModal(e.target.checked)}
              >
                {t('stock.showArchived', 'Показать архивированные')}
              </Checkbox>
            </div>
          )}

          <Form.Item
            name="barcode"
            label={t('stock.fieldProduct', 'Товар')}
            rules={[{ required: true, message: t('stock.validProduct', 'Выберите товар') }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              disabled={!!editingItem}
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 350 } } }}
              placeholder={t('stock.validProduct', 'Выберите товар')}
            >
              {modalProducts.map((p) => {
                const isArchived = Boolean(p.isArchived) || p.status === 'inactive';

                return (
                  <Option key={p.barcode} value={p.barcode}>
                    {p.name} ({p.barcode}){isArchived ? ` [${t('common.archive', 'Архив')}]` : ''}
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item
            name="boxes"
            label={t('stock.fieldBoxes', 'Количество коробок')}
            rules={[{ required: true, message: t('stock.validBoxes', 'Введите количество') }]}
          >
            <InputNumber min={editingItem ? 0 : 1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

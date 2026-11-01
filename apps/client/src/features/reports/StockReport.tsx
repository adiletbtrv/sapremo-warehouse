import { useState } from 'react';
import { Table, Button, Space, Input, Tag } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import EmptyState from '@/components/EmptyState';
import { useProductsPaginated } from '@/hooks/useProducts';
import { db } from '@/db/schema';
import { exportToExcel } from '@/utils/exportExcel';
import { toBoxes } from '@/utils/inventory';
import type { Product } from '@/types';
import { useTranslation } from 'react-i18next';

export default function StockReport() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: products,
    total,
    isLoading,
  } = useProductsPaginated(page, pageSize, search, 'active');

  const columns: ColumnsType<Product> = [
    {
      title: t('products.colBarcode', { defaultValue: 'Штрих-код' }),
      dataIndex: 'barcode',
      key: 'barcode',
      width: 150,
    },
    { title: t('products.colName', { defaultValue: 'Название' }), dataIndex: 'name', key: 'name' },
    {
      title: t('reports.colBoxCount', { defaultValue: 'Кол-во коробок' }),
      key: 'boxCount',
      width: 140,
      align: 'right',
      render: (_: unknown, record: Product) => {
        const boxes = toBoxes(record);
        return <span>{boxes}</span>;
      },
    },
    {
      title: t('reports.colStock', { defaultValue: 'Штук мороженого' }),
      dataIndex: 'stockQuantity',
      key: 'stockQuantity',
      width: 120,
      align: 'right',
      render: (v: number | null | undefined) => {
        const qty = v ?? 0;
        return <Tag color={qty === 0 ? 'red' : qty <= 10 ? 'orange' : 'green'}>{qty}</Tag>;
      },
    },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allProducts = await db.products
        .filter((p) => p.status === 'active' && !p.isArchived)
        .toArray();
      void exportToExcel(
        allProducts,
        [
          {
            header: t('products.colBarcode', { defaultValue: 'Штрих-код' }),
            value: (p) => p.barcode,
          },
          { header: t('products.colName', { defaultValue: 'Название' }), value: (p) => p.name },
          {
            header: t('reports.colBoxCount', { defaultValue: 'Кол-во коробок' }),
            value: (p) => toBoxes(p),
          },
          {
            header: t('reports.colStock', { defaultValue: 'Штук мороженого' }),
            value: (p) => p.stockQuantity,
          },
        ],
        'ostatki_na_sklade',
        t('reports.tabStock', { defaultValue: 'Остатки на складе' }),
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Input.Search
          placeholder={t('products.searchPlaceholder', { defaultValue: 'Поиск...' })}
          allowClear
          onSearch={(val) => {
            setSearch(val);
            setPage(1);
          }}
          style={{ width: 250 }}
        />
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => void handleExport()}
          loading={isExporting}
          disabled={isExporting || products.length === 0}
        >
          {t('common.exportExcel', { defaultValue: 'Экспорт в Excel' })}
        </Button>
      </Space>
      <Table<Product>
        rowKey="id"
        columns={columns}
        dataSource={products}
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
          emptyText: (
            <EmptyState
              description={t('products.emptyNoProducts', { defaultValue: 'Нет товаров' })}
            />
          ),
        }}
      />
    </Space>
  );
}

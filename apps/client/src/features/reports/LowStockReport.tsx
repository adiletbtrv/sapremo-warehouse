import { useMemo, useState } from 'react';
import { Table, Button, Space, InputNumber, Tag, Typography } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import EmptyState from '@/components/EmptyState';
import { useProducts } from '@/hooks/useProducts';
import { exportToExcel } from '@/utils/exportExcel';
import { toBoxes } from '@/utils/inventory';
import type { Product } from '@/types';

import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export default function LowStockReport() {
  const { t } = useTranslation();
  const products = useProducts();
  const [threshold, setThreshold] = useState(5);

  const rows = useMemo(
    () => products.filter((p) => toBoxes(p) <= threshold).sort((a, b) => toBoxes(a) - toBoxes(b)),
    [products, threshold],
  );

  const columns: ColumnsType<Product> = [
    {
      title: t('reports.colBarcode', 'Штрих-код'),
      dataIndex: 'barcode',
      key: 'barcode',
      width: 150,
    },
    { title: t('reports.colName', 'Название'), dataIndex: 'name', key: 'name' },
    {
      title: t('reports.colStockBoxes', 'Остаток (коробок)'),
      key: 'boxes',
      width: 150,
      align: 'right',
      render: (_, p: Product) => {
        const boxes = toBoxes(p);
        return (
          <Tag color={boxes === 0 ? 'red' : 'orange'}>
            {boxes} {t('reports.boxAbbr', 'кор.')}
          </Tag>
        );
      },
    },
  ];

  const handleExport = () =>
    exportToExcel(
      rows,
      [
        { header: t('reports.colBarcode', 'Штрих-код'), value: (p) => p.barcode },
        { header: t('reports.colName', 'Название'), value: (p) => p.name },
        { header: t('reports.colStockBoxes', 'Остаток (коробок)'), value: (p) => toBoxes(p) },
      ],
      'nizkiy_ostatok',
      'Низкий остаток',
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space>
          <Text>{t('reports.lowStockThreshold', 'Порог остатка (коробок):')}</Text>
          <InputNumber
            min={0}
            value={threshold}
            onChange={(v) => setThreshold(v ?? 0)}
            style={{ width: 100 }}
          />
        </Space>
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => {
            void handleExport();
          }}
          disabled={rows.length === 0}
        >
          {t('reports.btnExport', 'Экспорт в Excel')}
        </Button>
      </Space>
      <Table<Product>
        rowKey="barcode"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState description={t('reports.emptyLowStock', 'Нет товаров с низким остатком')} />
          ),
        }}
      />
    </Space>
  );
}

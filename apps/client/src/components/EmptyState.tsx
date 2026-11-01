import { Empty, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  description?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ description, action }: EmptyStateProps) {
  const { t } = useTranslation();
  const desc = description ?? t('common.noData', 'Нет данных');
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <Typography.Text type="secondary" style={{ marginTop: 16 }}>
          {desc}
        </Typography.Text>
      }
      style={{ padding: '24px 0' }}
    >
      {action}
    </Empty>
  );
}

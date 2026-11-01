import { type FC, type ReactNode, memo } from 'react';
import { Skeleton } from 'antd';

export interface StatCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  suffix?: string;
  isLoading?: boolean;
  valueColor?: string;
}

const StatCard: FC<StatCardProps> = ({
  title,
  value,
  icon,
  suffix = '',
  isLoading = false,
  valueColor,
}) => (
  <div className="dashboard-stat-card" style={{ flex: '1 1 250px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <span
        className="ant-statistic-title"
        style={{ whiteSpace: 'normal', wordBreak: 'break-word', paddingRight: 8 }}
      >
        {title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>{icon}</span>
    </div>

    <div style={{ marginTop: 16 }}>
      {isLoading ? (
        <Skeleton.Input active size="small" />
      ) : (
        <>
          <span
            className="ant-statistic-content-value"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
          </span>
          {suffix && <span className="ant-statistic-content-suffix">{suffix}</span>}
        </>
      )}
    </div>
  </div>
);

export default memo(StatCard);

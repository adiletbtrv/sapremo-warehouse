import type { FC, CSSProperties } from 'react';
import { Typography, theme } from 'antd';
import type dayjs from 'dayjs';
import { formatDateTime, type DateFormatPattern } from '@/utils/dateFormatter';

export interface DateDisplayProps {
  date: string | number | Date | dayjs.Dayjs | null | undefined;
  pattern?: DateFormatPattern | (string & Record<never, never>);
  fallback?: string;
  strong?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const DateDisplay: FC<DateDisplayProps> = ({
  date,
  pattern = 'date',
  fallback = '—',
  strong = false,
  className,
  style,
}) => {
  const { token } = theme.useToken();
  const formatted = formatDateTime(date, pattern, fallback);

  if (formatted === fallback) {
    return (
      <Typography.Text style={{ color: token.colorTextQuaternary, ...style }} className={className}>
        {fallback}
      </Typography.Text>
    );
  }

  return (
    <Typography.Text strong={strong} className={className} style={style}>
      {formatted}
    </Typography.Text>
  );
};

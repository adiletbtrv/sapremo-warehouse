import type { FC, CSSProperties } from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/utils/money';

export interface MoneyDisplayProps {
  amount: number | string | null | undefined;
  currencyFormat?: 'short' | 'full' | 'none'; // 'с' vs 'сом' vs none
  highlightSign?: boolean; // Зеленый плюс / красный минус
  strong?: boolean;
  decimals?: number;
  className?: string;
  style?: CSSProperties;
}

export const MoneyDisplay: FC<MoneyDisplayProps> = ({
  amount,
  currencyFormat = 'full',
  highlightSign = false,
  strong = false,
  decimals,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const val = Number(amount) || 0;

  let currencySymbol = '';
  if (currencyFormat === 'short') {
    currencySymbol = ` ${t('common.currencyShort', { defaultValue: 'с' })}`;
  } else if (currencyFormat === 'full') {
    currencySymbol = ` ${t('common.currency', { defaultValue: 'сом' })}`;
  }

  const formattedValue = `${formatMoney(Math.abs(val), decimals)}${currencySymbol}`;

  if (highlightSign && val !== 0) {
    const isPositive = val > 0;
    return (
      <Typography.Text
        type={isPositive ? 'success' : 'danger'}
        strong={strong}
        className={className}
        style={style}
      >
        {isPositive ? `+${formattedValue}` : `-${formattedValue}`}
      </Typography.Text>
    );
  }

  return (
    <Typography.Text strong={strong} className={className} style={style}>
      {formattedValue}
    </Typography.Text>
  );
};

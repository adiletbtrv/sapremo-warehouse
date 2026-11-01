import type { FactoryOrder } from '@/types';

export function resolveFactoryOrderNumber(order: FactoryOrder, allOrders: FactoryOrder[]): number {
  if (order.orderNumber) return order.orderNumber;
  const orderIdx = allOrders.findIndex((o) => o.id === order.id);
  return orderIdx !== -1 ? orderIdx + 1 : 1;
}

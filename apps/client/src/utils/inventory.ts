import type { Product } from '@/types';

/**
 * Returns the number of full boxes for a product based on its current stock quantity.
 * Uses integer division — partial boxes are not counted.
 */
export const toBoxes = (product: Pick<Product, 'stockQuantity' | 'boxQuantity'>): number => {
  if (!product.boxQuantity || product.boxQuantity <= 0) return 0;
  return Math.max(0, Math.floor((product.stockQuantity ?? 0) / product.boxQuantity));
};

/**
 * Returns a human-readable stock summary string.
 * Example: "12 кор. (288 шт)"
 */
export const formatStock = (product: Pick<Product, 'stockQuantity' | 'boxQuantity'>): string => {
  const boxes = toBoxes(product);
  return `${boxes} кор. (${product.stockQuantity} шт)`;
};

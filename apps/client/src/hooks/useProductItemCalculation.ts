import { useCallback } from 'react';
import type { Product } from '@/types';

export interface ProductItemCalculationResult {
  boxCount: number;
  quantityPieces: number;
  totalSum: number;
}

export function useProductItemCalculation() {
  const calculateFromBoxes = useCallback(
    (
      boxes: number | null | undefined,
      product?: Product,
      customPrice?: number,
    ): ProductItemCalculationResult => {
      const pcsPerBox = product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
      const price = customPrice ?? product?.factoryPrice ?? 0;
      const validBoxes = Math.max(0, Number(boxes) || 0);
      const quantityPieces = validBoxes * pcsPerBox;
      const totalSum = quantityPieces * price;

      return {
        boxCount: validBoxes,
        quantityPieces,
        totalSum,
      };
    },
    [],
  );

  const calculateFromPieces = useCallback(
    (
      pieces: number | null | undefined,
      product?: Product,
      customPrice?: number,
    ): ProductItemCalculationResult => {
      const pcsPerBox = product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
      const price = customPrice ?? product?.factoryPrice ?? 0;
      const validPieces = Math.max(0, Number(pieces) || 0);
      const boxCount = pcsPerBox > 0 ? Math.ceil(validPieces / pcsPerBox) : validPieces;
      const totalSum = validPieces * price;

      return {
        boxCount,
        quantityPieces: validPieces,
        totalSum,
      };
    },
    [],
  );

  return {
    calculateFromBoxes,
    calculateFromPieces,
  };
}

import { z } from 'zod';

export const ApiProductSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? String(val) : undefined)),
  product_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? String(val) : undefined)),
  productId: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? String(val) : undefined)),
  barcode: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? String(val) : '')),
  name: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  product_name: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  productName: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  title: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  pieces_per_box: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  piecesPerBox: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  boxQuantity: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  box_quantity: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  expiry_date: z
    .string()
    .nullish()
    .transform((val) => val ?? ''),
  expirationDate: z
    .string()
    .nullish()
    .transform((val) => val ?? ''),
  batch_number: z
    .string()
    .nullish()
    .transform((val) => val ?? ''),
  batchNumber: z
    .string()
    .nullish()
    .transform((val) => val ?? ''),
  factory_price: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  factoryPrice: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  price: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  unit_price: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  status: z
    .string()
    .nullish()
    .transform((val) => val ?? 'active'),
  stockQuantity: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  stock_quantity: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  quantity_pieces: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
  quantity_boxes: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => (val != null ? Number(val) : undefined)),
});

export const ApiProductListSchema = z.array(ApiProductSchema);

export type ParsedApiProduct = z.infer<typeof ApiProductSchema>;

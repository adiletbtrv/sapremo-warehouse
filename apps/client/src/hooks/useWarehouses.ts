import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { factoryClient } from '@/api/client';
import type { Warehouse } from '@/types';

const KEY = ['warehouses'];

export interface WarehousePayload {
  name: string;
  address?: string;
  isActive?: boolean;
}

interface FactoryWarehouseRaw {
  id: number | string;
  name: string;
  address?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PaginatedResponse {
  results: FactoryWarehouseRaw[];
}

function fromFactory(raw: FactoryWarehouseRaw): Warehouse {
  return {
    id: String(raw.id),
    name: raw.name,
    address: raw.address,
    isActive: raw.is_active,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/** Convert internal Warehouse payload to factory-service snake_case */
function toFactoryPayload(payload: WarehousePayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.address !== undefined) out.address = payload.address ?? '';
  if (payload.isActive !== undefined) out.is_active = payload.isActive;
  return out;
}

export function useWarehouses() {
  return useQuery<Warehouse[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await factoryClient.get<FactoryWarehouseRaw[] | PaginatedResponse>(
        '/warehouses/',
        { params: { page_size: 1000 } },
      );
      const list: FactoryWarehouseRaw[] = Array.isArray(data) ? data : (data?.results ?? []);
      return list.map(fromFactory);
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WarehousePayload) => {
      const { data } = await factoryClient.post<FactoryWarehouseRaw>(
        '/warehouses/',
        toFactoryPayload(payload),
      );
      return fromFactory(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: WarehousePayload }) => {
      const { data } = await factoryClient.put<FactoryWarehouseRaw>(
        `/warehouses/${id}/`,
        toFactoryPayload(payload),
      );
      return fromFactory(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await factoryClient.delete(`/warehouses/${id}/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

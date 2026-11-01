import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Table } from 'dexie';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  isLoading: boolean;
  error?: Error;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Pagination hook for large Dexie tables
 */
export function usePaginatedQuery<T, Key>(
  table: Table<T, Key>,
  initialPageSize = 20,
  filterFn?: (item: T) => boolean,
  sortBy?: string,
  reverse = false,
): PaginatedResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [queryError, setQueryError] = useState<Error | undefined>();

  const offset = (page - 1) * pageSize;

  const queryResult = useLiveQuery(
    async () => {
      try {
        let collection = table.toCollection();

        if (sortBy) {
          collection = table.orderBy(sortBy);
        }

        if (reverse) {
          collection = collection.reverse();
        }

        if (filterFn) {
          collection = collection.filter(filterFn);
        }
        const filteredCollection = collection.filter(
          (item: T) => !(item as { isArchived?: boolean }).isArchived,
        );

        const total = await filteredCollection.count();
        const data = await filteredCollection.offset(offset).limit(pageSize).toArray();

        return { data, total, error: undefined };
      } catch (err) {
        console.error(`[usePaginatedQuery] Error querying table ${table.name}:`, err);
        return {
          data: [] as T[],
          total: 0,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },
    [page, pageSize, sortBy, reverse, filterFn],

    { data: [] as T[], total: 0, error: undefined },
  );

  useEffect(() => {
    if (queryResult?.error) {
      setQueryError(queryResult.error);
    } else {
      setQueryError(undefined);
    }
  }, [queryResult?.error]);

  return {
    data: queryResult?.data ?? [],
    total: queryResult?.total ?? 0,
    isLoading: queryResult === undefined,
    error: queryError,
    page,
    pageSize,
    setPage,
    setPageSize,
  };
}

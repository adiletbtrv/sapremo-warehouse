import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { Transaction } from '@/types';

export function useTransactions(): Transaction[] {
  return useLiveQuery(
    () =>
      db.transactions
        .orderBy('date')
        .reverse()
        .filter((t) => !t.isArchived)
        .toArray(),
    [],
    [],
  );
}

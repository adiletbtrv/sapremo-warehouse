import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { SyncTask } from '@/types';

export function usePendingSyncCount(): number {
  return useLiveQuery(() => db.syncQueue.where('status').equals('pending').count(), [], 0);
}

export function useFailedSyncTasks(): SyncTask[] {
  return useLiveQuery(() => db.syncQueue.where('status').equals('failed').toArray(), [], []);
}

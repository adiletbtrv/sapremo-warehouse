import { db } from '@/db/schema';
import { useAuthStore } from '@/store/authStore';
import dayjs from 'dayjs';
import type { AuditLog } from '@/types';

/**
 * Global function to create an audit record for any mutation (Create, Update, Delete).
 * It automatically grabs the current user from authStore.
 *
 * @param entityName Name of the table/entity (e.g. 'products', 'receipts')
 * @param entityId ID of the record being modified
 * @param oldValue Previous state of the record (null for creations)
 * @param newValue New state of the record (null for deletions)
 */
export function createAuditRecord(
  entityName: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
) {
  if (!entityId || !entityName) return;

  const auth = useAuthStore.getState();
  const expectedGeneration = auth.sessionGeneration;
  const expectedUserId = auth.user?.id ?? null;
  const expectedUserName = auth.user?.fullName ?? 'Система';

  setTimeout(() => {
    void import('dexie').then(({ default: Dexie }) => {
      void Dexie.ignoreTransaction(async () => {
        try {
          if (!db.isOpen()) {
            await db.open().catch((err: unknown) => {
              // Ignore open error if database connection is busy
              void err;
            });
          }
          if (!db.isOpen()) return;

          const currentAuth = useAuthStore.getState();
          if (
            currentAuth.sessionGeneration !== expectedGeneration ||
            currentAuth.user?.id !== expectedUserId
          ) {
            return;
          }

          const auditEntry: AuditLog = {
            id: crypto.randomUUID(),
            entityId: String(entityId),
            entityName,
            userId: expectedUserId ?? 'unknown',
            userName: expectedUserName,
            oldValue: oldValue ? JSON.stringify(oldValue) : '',
            newValue: newValue ? JSON.stringify(newValue) : '',
            createdAt: dayjs().toISOString(),
          };

          await db.auditLogs.add(auditEntry);
        } catch (error: unknown) {
          const errName = (error as { name?: string })?.name;
          if (
            errName === 'AbortError' ||
            errName === 'DatabaseClosedError' ||
            String(error).includes('Connection is closing')
          ) {
            // Database is closing or connection interrupted; silently drop background audit log
            return;
          }
          if (import.meta.env.DEV) {
            console.warn('Failed to create audit record:', error);
          }
        }
      });
    });
  }, 50);
}

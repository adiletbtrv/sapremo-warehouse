import Dexie from 'dexie';
import { logger } from '@/utils/logger';

const EMERGENCY_QUEUE_KEY = 'warehouse_emergency_sync_queue';
const RECOVERY_FLAG_KEY = 'warehouse_db_recovered';

/**
 * Restores any emergency syncQueue items saved to localStorage during a previous recovery.
 */
export async function restoreEmergencySyncQueue(dbInstance: Dexie): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  try {
    const rawData = localStorage.getItem(EMERGENCY_QUEUE_KEY);
    if (!rawData) return;

    const items: unknown = JSON.parse(rawData);
    if (
      Array.isArray(items) &&
      items.length > 0 &&
      dbInstance.tables.some((t) => t.name === 'syncQueue')
    ) {
      const table = dbInstance.table('syncQueue');
      await table.bulkPut(items as unknown[]);
      logger.info(
        `[DisasterRecovery] Restored ${items.length} emergency syncQueue tasks to database.`,
      );
    }

    localStorage.removeItem(EMERGENCY_QUEUE_KEY);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(RECOVERY_FLAG_KEY);
    }
  } catch (err) {
    logger.error('[DisasterRecovery] Failed to restore emergency syncQueue:', err);
  }
}

/**
 * SRE-03: Disaster Recovery Manager for IndexedDB.
 * Automatically backs up unsynced queue items to localStorage,
 * closes active database connections, deletes corrupted IndexedDB database,
 * and triggers a safe, non-looping reload.
 */
export async function handleDatabaseCorruption(err: unknown): Promise<void> {
  logger.error(
    '[DisasterRecovery] Critical database corruption detected. Initiating recovery...',
    err,
  );

  // 1. Защита от бесконечного цикла перезагрузки (Loop of Death)
  if (typeof sessionStorage !== 'undefined') {
    const alreadyAttempted = sessionStorage.getItem(RECOVERY_FLAG_KEY);
    if (alreadyAttempted) {
      logger.error(
        '[DisasterRecovery] Recovery was already attempted in this session. Aborting reload loop to prevent browser freeze.',
      );
      return;
    }
    sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true');
  }

  // 2. Попытка забэкапить очередь синхронизации (syncQueue) в localStorage с гарантированным закрытием tempDb
  let tempDb: Dexie | null = null;
  try {
    tempDb = new Dexie('WarehouseDB');
    const dbInstance = await tempDb.open();
    if (dbInstance.tables.some((t) => t.name === 'syncQueue')) {
      const syncQueueData = await dbInstance.table('syncQueue').toArray();
      if (syncQueueData && syncQueueData.length > 0 && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(EMERGENCY_QUEUE_KEY, JSON.stringify(syncQueueData));
          logger.info(
            '[DisasterRecovery] Successfully backed up emergency sync queue to localStorage',
            { count: syncQueueData.length },
          );
        } catch (storageErr) {
          logger.warn(
            '[DisasterRecovery] Could not write emergency backup to localStorage (quota exceeded)',
            { error: String(storageErr) },
          );
        }
      }
    }
  } catch (backupErr) {
    logger.error(
      '[DisasterRecovery] Failed to backup syncQueue during database corruption recovery',
      backupErr,
    );
  } finally {
    if (tempDb) {
      try {
        tempDb.close();
      } catch {
        // Ignore close error on tempDb
      }
    }
  }

  // 3. Закрываем активное соединение основной базы данных, если оно открыто, чтобы не заблокировать удаление базы
  try {
    const { db } = await import('./schema');
    if (db && typeof db.close === 'function') {
      db.close();
    }
  } catch {
    // Ignore import error
  }

  // 4. Безопасное удаление поврежденной базы с таймаутом против блокировки
  let deleteSuccess = false;
  try {
    await Promise.race([
      Dexie.delete('WarehouseDB'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Dexie.delete timeout (database blocked)')), 5000),
      ),
    ]);
    deleteSuccess = true;
    logger.info('[DisasterRecovery] WarehouseDB successfully deleted.');
  } catch (deleteErr) {
    logger.error('[DisasterRecovery] Failed to delete database during recovery:', deleteErr);
  }

  // 5. Перезагрузка страницы только при успешном удалении
  if (deleteSuccess && typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
}

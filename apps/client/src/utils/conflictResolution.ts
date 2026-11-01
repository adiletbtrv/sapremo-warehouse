/**
 * Offline-First Conflict Resolution Engine
 *
 * Implements deterministic state convergence between local IndexedDB (Dexie.js)
 * optimistic state and remote Gateway state using:
 *   1. Entity Version Vector comparison (monotonic lamport-style version counter)
 *   2. Last-Write-Wins (LWW) timestamp register resolution with deterministic tie-breaking
 */

export interface VersionedEntity {
  id?: string;
  version?: number;
  updatedAt?: string | number;
  localUpdatedAt?: string | number;
  date?: string | number;
}

export interface ConflictResolutionResult<T> {
  winner: 'local' | 'remote';
  resolved: T;
  strategy: 'version-vector' | 'lww-timestamp' | 'pending-outbox-lock' | 'tie-breaker';
  localTimestampMs: number;
  remoteTimestampMs: number;
  mergedVersion: number;
}

/**
 * Parses an ISO-8601 string or epoch millisecond value into a normalized epoch timestamp.
 */
export function parseEntityTimestamp(value?: string | number | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Resolves a state conflict between a local optimistic entity and a remote server entity
 * using Last-Write-Wins (LWW) and Entity Version Vectors.
 *
 * Formal resolution rule:
 *   1. If `hasPendingOutboxMutation` is true, local optimistic state holds an active lock
 *      until the outbox mutation is flushed and acknowledged.
 *   2. If both entities carry explicit `version` numbers and `v_local !== v_remote`,
 *      select argmax(v_local, v_remote).
 *   3. Otherwise compare timestamps `t_local = max(localUpdatedAt, updatedAt)` vs `t_remote = updatedAt`:
 *      - If `t_local > t_remote`, local state wins (`winner = 'local'`).
 *      - If `t_remote > t_local`, remote state wins (`winner = 'remote'`).
 *      - If `t_local === t_remote`, remote authoritative state wins as deterministic tie-breaker.
 */
export function resolveLWWConflict<T extends VersionedEntity>(
  localEntity: T,
  remoteEntity: T,
  hasPendingOutboxMutation = false
): ConflictResolutionResult<T> {
  const localTs = Math.max(
    parseEntityTimestamp(localEntity.localUpdatedAt),
    parseEntityTimestamp(localEntity.updatedAt),
    parseEntityTimestamp(localEntity.date)
  );
  const remoteTs = Math.max(
    parseEntityTimestamp(remoteEntity.updatedAt),
    parseEntityTimestamp(remoteEntity.date)
  );

  const localVersion = typeof localEntity.version === 'number' ? localEntity.version : undefined;
  const remoteVersion = typeof remoteEntity.version === 'number' ? remoteEntity.version : undefined;
  const maxVersion = Math.max(localVersion ?? 1, remoteVersion ?? 1);

  if (hasPendingOutboxMutation) {
    return {
      winner: 'local',
      resolved: {
        ...remoteEntity,
        ...localEntity,
        version: maxVersion,
      },
      strategy: 'pending-outbox-lock',
      localTimestampMs: localTs,
      remoteTimestampMs: remoteTs,
      mergedVersion: maxVersion,
    };
  }

  // Version vector comparison when both sides provide explicit versions and timestamps are equal or absent
  if (
    localVersion !== undefined &&
    remoteVersion !== undefined &&
    localVersion !== remoteVersion &&
    (localTs === 0 || remoteTs === 0 || localTs === remoteTs)
  ) {
    const winner = localVersion > remoteVersion ? 'local' : 'remote';
    const winningEntity = winner === 'local' ? localEntity : remoteEntity;
    return {
      winner,
      resolved: {
        ...(winner === 'local' ? remoteEntity : localEntity),
        ...winningEntity,
        version: maxVersion,
      },
      strategy: 'version-vector',
      localTimestampMs: localTs,
      remoteTimestampMs: remoteTs,
      mergedVersion: maxVersion,
    };
  }

  // Last-Write-Wins (LWW) by wall-clock / logical timestamp
  if (localTs > remoteTs) {
    return {
      winner: 'local',
      resolved: {
        ...remoteEntity,
        ...localEntity,
        version: maxVersion,
      },
      strategy: 'lww-timestamp',
      localTimestampMs: localTs,
      remoteTimestampMs: remoteTs,
      mergedVersion: maxVersion,
    };
  }

  if (remoteTs > localTs) {
    return {
      winner: 'remote',
      resolved: {
        ...localEntity,
        ...remoteEntity,
        version: maxVersion,
      },
      strategy: 'lww-timestamp',
      localTimestampMs: localTs,
      remoteTimestampMs: remoteTs,
      mergedVersion: maxVersion,
    };
  }

  // Deterministic tie-breaker: server authoritative state wins on exact timestamp equality
  return {
    winner: 'remote',
    resolved: {
      ...localEntity,
      ...remoteEntity,
      version: maxVersion,
    },
    strategy: 'tie-breaker',
    localTimestampMs: localTs,
    remoteTimestampMs: remoteTs,
    mergedVersion: maxVersion,
  };
}


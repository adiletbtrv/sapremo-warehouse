import type { Request, Response, NextFunction } from 'express';

export interface ChaosConfig {
  enabled: boolean;
  minLatencyMs: number;
  maxLatencyMs: number;
  dropRate: number;
  flappingMode: boolean;
  flapIntervalMs: number;
}

const state: ChaosConfig = {
  enabled: process.env.MOCK_CHAOS_ENABLED !== 'false',
  minLatencyMs: Number(process.env.MOCK_LATENCY_MIN_MS ?? 50),
  maxLatencyMs: Number(process.env.MOCK_LATENCY_MAX_MS ?? 300),
  dropRate: Number(process.env.MOCK_DROP_RATE ?? 0),
  flappingMode: process.env.MOCK_FLAPPING_MODE === 'true',
  flapIntervalMs: Number(process.env.MOCK_FLAP_INTERVAL_MS ?? 15_000),
};

export function getChaosConfig(): ChaosConfig {
  return { ...state };
}

export function updateChaosConfig(patch: Partial<ChaosConfig>): ChaosConfig {
  if (typeof patch.enabled === 'boolean') state.enabled = patch.enabled;
  if (typeof patch.minLatencyMs === 'number' && patch.minLatencyMs >= 0) {
    state.minLatencyMs = patch.minLatencyMs;
  }
  if (typeof patch.maxLatencyMs === 'number' && patch.maxLatencyMs >= state.minLatencyMs) {
    state.maxLatencyMs = patch.maxLatencyMs;
  }
  if (typeof patch.dropRate === 'number') {
    state.dropRate = Math.max(0, Math.min(1, patch.dropRate));
  }
  if (typeof patch.flappingMode === 'boolean') {
    state.flappingMode = patch.flappingMode;
  }
  if (typeof patch.flapIntervalMs === 'number' && patch.flapIntervalMs >= 1000) {
    state.flapIntervalMs = patch.flapIntervalMs;
  }
  return getChaosConfig();
}

/**
 * Express Middleware: Network Degradation & Packet Drop Simulator
 *
 * Injects uniform random jitter U(minLatencyMs, maxLatencyMs) and probabilistic
 * Bernoulli packet loss B(p = dropRate) or square-wave network flapping to
 * demonstrate client-side Dexie.js outbox mutation buffering and LWW reconciliation.
 */
export function networkDegradationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Always bypass chaos for health, chaos control, and SockJS handshake info
  if (
    req.path.includes('/health') ||
    req.path.includes('/chaos/config') ||
    req.path.endsWith('/ws/info')
  ) {
    next();
    return;
  }

  if (!state.enabled) {
    next();
    return;
  }

  const headerLatency = req.headers['x-chaos-latency-ms'];
  const minMs = state.minLatencyMs;
  const maxMs = Math.max(minMs, state.maxLatencyMs);
  const simulatedDelayMs =
    headerLatency !== undefined
      ? Math.max(0, Number(headerLatency) || 0)
      : Math.floor(minMs + Math.random() * (maxMs - minMs + 1));

  const headerDropRate = req.headers['x-chaos-drop-rate'];
  let effectiveDropRate =
    headerDropRate !== undefined ? Number(headerDropRate) : state.dropRate;

  if (state.flappingMode) {
    const cyclePhase = Math.floor(Date.now() / state.flapIntervalMs) % 2;
    if (cyclePhase === 1) {
      effectiveDropRate = Math.max(effectiveDropRate, 0.85);
    }
  }

  const shouldDrop = effectiveDropRate > 0 && Math.random() < effectiveDropRate;

  setTimeout(() => {
    res.setHeader('X-Simulated-Latency-Ms', String(simulatedDelayMs));
    res.setHeader('X-Chaos-Drop-Rate', String(effectiveDropRate));

    if (shouldDrop) {
      res.status(503).json({
        code: 'NETWORK_FLAP_SIMULATED',
        message: 'Simulated network degradation / packet loss (503 Service Unavailable)',
        simulatedLatencyMs: simulatedDelayMs,
        dropRate: effectiveDropRate,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  }, simulatedDelayMs);
}


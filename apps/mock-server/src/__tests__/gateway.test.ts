import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  computeEan13CheckDigit,
  generateValidEan13,
  generateCode128Barcode,
} from '../data/seed.js';
import { getChaosConfig, updateChaosConfig } from '../middleware/networkSimulator.js';

describe('Mock Gateway Seed & Storage Topology', () => {
  beforeEach(() => {
    store.seedAll();
    updateChaosConfig({ enabled: true, minLatencyMs: 50, maxLatencyMs: 300, dropRate: 0 });
  });

  it('seeds 520+ SKUs with mathematically valid GS1 EAN-13 and Code 128 barcodes', () => {
    expect(store.skus.size).toBeGreaterThanOrEqual(500);
    expect(store.skus.size).toBe(520);

    for (const sku of store.skus.values()) {
      expect(sku.barcode).toMatch(/^\d{13}$/);
      const prefix12 = sku.barcode.slice(0, 12);
      const expectedCheck = computeEan13CheckDigit(prefix12);
      expect(Number(sku.barcode[12])).toBe(expectedCheck);
      expect(sku.code128).toContain('C128-W01-SKU');
      expect(sku.binCode).toMatch(/^A\d{2}-R\d{2}-S\d{2}-B\d{2}$/);
    }
  });

  it('populates Aisle/Rack/Shelf/Bin storage cells, batches, and movement ledger', () => {
    expect(store.bins.size).toBeGreaterThanOrEqual(100);
    expect(store.batches.size).toBe(520);
    expect(store.movements.length).toBeGreaterThan(0);

    const sampleEan = generateValidEan13(42);
    expect(sampleEan).toHaveLength(13);
    const sampleC128 = generateCode128Barcode(42, 7);
    expect(sampleC128).toBe('C128-W01-SKU0042-B007');
  });

  it('configures Chaos Network Degradation Simulator parameters', () => {
    const updated = updateChaosConfig({
      minLatencyMs: 80,
      maxLatencyMs: 250,
      dropRate: 0.35,
      flappingMode: true,
    });
    expect(updated.minLatencyMs).toBe(80);
    expect(updated.maxLatencyMs).toBe(250);
    expect(updated.dropRate).toBe(0.35);
    expect(updated.flappingMode).toBe(true);
    expect(getChaosConfig().dropRate).toBe(0.35);
  });
});


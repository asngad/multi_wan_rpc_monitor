const MultiWanRules = require('../src/anomaly/multiWanRules');

describe('Pengujian Unit Multi-WAN Domain Rules', () => {
  describe('checkFlapping', () => {
    test('Mendeteksi antarmuka flapping saat terjadi perubahan status berulang', () => {
      const now = Date.now();
      const flappingHistory = [
        { status: 'UP', timestamp: now - 30000 },
        { status: 'DOWN', timestamp: now - 25000 },
        { status: 'UP', timestamp: now - 20000 },
        { status: 'DOWN', timestamp: now - 15000 },
        { status: 'UP', timestamp: now - 5000 }
      ];

      const result = MultiWanRules.checkFlapping(flappingHistory, 3, 60);
      expect(result.isFlapping).toBe(true);
      expect(result.toggles).toBe(4);
    });

    test('Tidak menandai flapping jika status stabil', () => {
      const now = Date.now();
      const stableHistory = [
        { status: 'UP', timestamp: now - 30000 },
        { status: 'UP', timestamp: now - 20000 },
        { status: 'UP', timestamp: now - 10000 }
      ];

      const result = MultiWanRules.checkFlapping(stableHistory, 3, 60);
      expect(result.isFlapping).toBe(false);
      expect(result.toggles).toBe(0);
    });
  });

  describe('checkBandwidthSaturation', () => {
    test('Mendeteksi saturasi bandwidth (>90%) dan bufferbloat', () => {
      // Kapasitas 100Mbps, trafik 95Mbps, latensi 50ms vs baseline 15ms (>2x)
      const res = MultiWanRules.checkBandwidthSaturation(95, 100, 50, 15, 90);
      expect(res.isSaturated).toBe(true);
      expect(res.utilizationPercent).toBe(95);
      expect(res.isBufferbloat).toBe(true);
    });

    test('Tidak mendeteksi saturasi jika penggunaan normal', () => {
      const res = MultiWanRules.checkBandwidthSaturation(40, 100, 16, 15, 90);
      expect(res.isSaturated).toBe(false);
      expect(res.isBufferbloat).toBe(false);
    });
  });

  describe('checkAsymmetricLoss', () => {
    test('Mendeteksi asymmetric loss saat salah satu WAN drop paket tinggi', () => {
      const allWans = [
        { id: 'wan-1', loss: 22.0 },
        { id: 'wan-2', loss: 0.1 },
        { id: 'wan-3', loss: 0.2 }
      ];

      const res = MultiWanRules.checkAsymmetricLoss('wan-1', 22.0, allWans, 12.0);
      expect(res.isAsymmetric).toBe(true);
      expect(res.lossDifference).toBeGreaterThan(12.0);
    });

    test('Tidak mendeteksi asymmetric loss jika semua WAN memiliki loss serupa', () => {
      const allWans = [
        { id: 'wan-1', loss: 2.0 },
        { id: 'wan-2', loss: 1.8 },
        { id: 'wan-3', loss: 2.2 }
      ];

      const res = MultiWanRules.checkAsymmetricLoss('wan-1', 2.0, allWans, 12.0);
      expect(res.isAsymmetric).toBe(false);
    });
  });

  describe('checkTrafficBurst', () => {
    test('Mendeteksi lonjakan trafik mendadak di atas ambang baseline', () => {
      const res = MultiWanRules.checkTrafficBurst(90, 25, 2.8);
      expect(res.isBurst).toBe(true);
      expect(res.ratio).toBe(3.6);
    });
  });
});

const AnomalyEngine = require('../src/anomaly/anomalyEngine');

describe('Pengujian Integrasi Anomaly Detection Engine', () => {
  let engine;

  beforeEach(() => {
    engine = new AnomalyEngine();
  });

  test('Evaluasi kondisi normal menghasilkan status NORMAL dan healthScore tinggi', () => {
    const metric = {
      wanId: 'wan-1',
      rtt: 14.5,
      loss: 0.1,
      rxThroughput: 30,
      txThroughput: 10,
      status: 'UP',
      capacityMbps: 100,
      baselineLatencyMs: 14
    };

    const evalResult = engine.evaluate(metric);
    expect(evalResult.wanId).toBe('wan-1');
    expect(evalResult.hasAnomaly).toBe(false);
    expect(evalResult.severity).toBe('NORMAL');
    expect(evalResult.healthScore).toBeGreaterThanOrEqual(95);
  });

  test('Mendeteksi link DOWN dan memberikan tingkat keparahan CRITICAL serta healthScore 0', () => {
    const metric = {
      wanId: 'wan-1',
      rtt: 0,
      loss: 100,
      rxThroughput: 0,
      txThroughput: 0,
      status: 'DOWN',
      capacityMbps: 100,
      baselineLatencyMs: 14
    };

    const evalResult = engine.evaluate(metric);
    expect(evalResult.hasAnomaly).toBe(true);
    expect(evalResult.severity).toBe('CRITICAL');
    expect(evalResult.healthScore).toBe(0);
    expect(evalResult.anomalies.some(a => a.type === 'GATEWAY_DOWN')).toBe(true);
  });

  test('Mendeteksi lonjakan latensi ekstrem melalui deviasi statistik Z-Score', () => {
    // Bangun baseline normal terlebih dahulu
    for (let i = 0; i < 15; i++) {
      engine.evaluate({
        wanId: 'wan-1',
        rtt: 14.0 + (i % 2 === 0 ? 0.5 : -0.5),
        loss: 0,
        rxThroughput: 20,
        txThroughput: 5,
        status: 'UP',
        capacityMbps: 100,
        baselineLatencyMs: 14
      });
    }

    // Injeksi lonjakan latensi ekstrem 190ms
    const spikeResult = engine.evaluate({
      wanId: 'wan-1',
      rtt: 190.0,
      loss: 0,
      rxThroughput: 20,
      txThroughput: 5,
      status: 'UP',
      capacityMbps: 100,
      baselineLatencyMs: 14
    });

    expect(spikeResult.hasAnomaly).toBe(true);
    expect(spikeResult.severity).toBe('CRITICAL');
    expect(spikeResult.anomalies.some(a => a.type === 'LATENCY_SPIKE_ZSCORE')).toBe(true);
    expect(spikeResult.healthScore).toBeLessThan(80);
  });
});

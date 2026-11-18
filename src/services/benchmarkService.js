/**
 * Benchmark Service: Komparasi Kinerja RPC vs REST Polling
 * Modul pengujian empiris untuk Bab 4 Skripsi:
 * Mengukur latency, overhead bandwidth, throughput, dan efisiensi komunikasi telemetri.
 */

const http = require('http');

class BenchmarkService {
  /**
   * Menjalankan pengujian komparatif antara RPC dan REST
   * @param {string} host
   * @param {number} port
   * @param {number} iterations - Jumlah pengulangan request (default: 50)
   * @returns {Promise<Object>} Laporan hasil benchmark
   */
  async runComparison(host = '127.0.0.1', port = 4000, iterations = 50) {
    const samplePayload = {
      wanId: 'wan-citra',
      rtt: 6.4,
      jitter: 0.9,
      loss: 0.0,
      rxThroughput: 35.8,
      txThroughput: 12.4,
      status: 'UP'
    };

    // 1. Uji Kinerja RPC (JSON-RPC 2.0)
    const rpcResults = await this._testRpc(host, port, samplePayload, iterations);

    // 2. Uji Kinerja REST (HTTP POST)
    const restResults = await this._testRest(host, port, samplePayload, iterations);

    // 3. Kalkulasi Analisis Komparatif
    const latencyReductionPercent = Number(
      (((restResults.avgLatencyMs - rpcResults.avgLatencyMs) / restResults.avgLatencyMs) * 100).toFixed(2)
    );

    const throughputImprovementPercent = Number(
      (((rpcResults.reqPerSec - restResults.reqPerSec) / restResults.reqPerSec) * 100).toFixed(2)
    );

    return {
      timestamp: new Date().toISOString(),
      iterations,
      rpc: rpcResults,
      rest: restResults,
      analysis: {
        latencyReductionPercent,
        throughputImprovementPercent,
        conclusion: `Metode RPC menghasilkan waktu respon ${latencyReductionPercent}% lebih cepat dan peningkatan throughput ${throughputImprovementPercent}% dibandingkan REST Polling.`
      }
    };
  }

  /**
   * Pengujian pemanggilan via RPC
   */
  async _testRpc(host, port, payload, iterations) {
    const latencies = [];
    let totalBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const rpcBody = JSON.stringify({
        jsonrpc: '2.0',
        method: 'ingestWANMetrics',
        params: payload,
        id: i + 1
      });

      const reqStart = process.hrtime.bigint();
      const res = await this._sendHttpRequest(host, port, '/rpc', 'POST', rpcBody, {
        'Content-Type': 'application/json'
      });
      const reqEnd = process.hrtime.bigint();

      const latencyMs = Number(reqEnd - reqStart) / 1000000;
      latencies.push(latencyMs);
      totalBytes += rpcBody.length + (res.body ? res.body.length : 0);
    }

    const totalTimeMs = Date.now() - startTime;
    return this._calculateStats('RPC (JSON-RPC 2.0)', latencies, totalTimeMs, totalBytes, iterations);
  }

  /**
   * Pengujian pemanggilan via REST
   */
  async _testRest(host, port, payload, iterations) {
    const latencies = [];
    let totalBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const restBody = JSON.stringify(payload);

      const reqStart = process.hrtime.bigint();
      const res = await this._sendHttpRequest(host, port, '/api/metrics/telemetry', 'POST', restBody, {
        'Content-Type': 'application/json'
      });
      const reqEnd = process.hrtime.bigint();

      const latencyMs = Number(reqEnd - reqStart) / 1000000;
      latencies.push(latencyMs);
      totalBytes += restBody.length + (res.body ? res.body.length : 0);
    }

    const totalTimeMs = Date.now() - startTime;
    return this._calculateStats('REST Polling (HTTP)', latencies, totalTimeMs, totalBytes, iterations);
  }

  /**
   * Helper kalkulasi statistik numerik
   */
  _calculateStats(protocolName, latencies, totalTimeMs, totalBytes, iterations) {
    latencies.sort((a, b) => a - b);
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    const avgLatency = sum / latencies.length;
    const minLatency = latencies[0];
    const maxLatency = latencies[latencies.length - 1];
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index] || maxLatency;
    const reqPerSec = Number(((iterations / (totalTimeMs / 1000))).toFixed(1));

    return {
      protocol: protocolName,
      totalIterations: iterations,
      avgLatencyMs: Number(avgLatency.toFixed(3)),
      minLatencyMs: Number(minLatency.toFixed(3)),
      maxLatencyMs: Number(maxLatency.toFixed(3)),
      p95LatencyMs: Number(p95Latency.toFixed(3)),
      reqPerSec,
      totalDurationMs: totalTimeMs,
      avgBytesPerCall: Math.round(totalBytes / iterations)
    };
  }

  /**
   * Helper pengiriman request HTTP mentah
   */
  _sendHttpRequest(host, port, path, method, body, headers) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: port,
        path: path,
        method: method,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}

module.exports = new BenchmarkService();

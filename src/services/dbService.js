/**
 * Database Persistence Service
 * Menyimpan metrik telemetri RPC, log anomali, dan hasil benchmark ke MySQL.
 */

const { pool } = require('../config/database');

class DbService {
  /**
   * Menyimpan data telemetri yang diterima via RPC
   */
  static async saveTelemetry(telemetry) {
    if (process.env.NODE_ENV === 'test') return;
    const sql = `
      INSERT INTO wan_telemetry_history 
        (wan_id, rtt_ms, jitter_ms, packet_loss_pct, rx_throughput_mbps, tx_throughput_mbps, health_score, has_anomaly, rpc_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      telemetry.wanId,
      telemetry.rtt || 0,
      telemetry.jitter || 0,
      telemetry.loss || 0,
      telemetry.rxThroughput || 0,
      telemetry.txThroughput || 0,
      telemetry.healthScore || 100,
      telemetry.hasAnomaly ? 1 : 0,
      telemetry.rpcMethod || 'ingestWANMetrics'
    ];

    try {
      await pool.execute(sql, params);
    } catch (err) {
      // Non-blocking error handling agar pipeline stream RPC tetap lancar
      // console.error('[DbService] Error saveTelemetry:', err.message);
    }
  }

  /**
   * Menyimpan log anomali yang terdeteksi
   */
  static async saveAnomaly(anomaly) {
    if (process.env.NODE_ENV === 'test') return;
    const sql = `
      INSERT INTO anomaly_logs
        (wan_id, anomaly_type, severity, z_score, metric_value, threshold_value, message, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      anomaly.wanId,
      anomaly.type || 'ANOMALY_DETECTED',
      anomaly.severity || 'WARNING',
      typeof anomaly.zScore === 'number' ? anomaly.zScore : null,
      anomaly.metricValue || 0,
      anomaly.thresholdValue || null,
      anomaly.message || '',
      anomaly.recommendation || ''
    ];

    try {
      await pool.execute(sql, params);
    } catch (err) {
      // console.error('[DbService] Error saveAnomaly:', err.message);
    }
  }

  /**
   * Menyimpan hasil pengujian komparasi empiris RPC vs REST
   */
  static async saveBenchmarkResult(result) {
    const sql = `
      INSERT INTO benchmark_history
        (iterations, rpc_avg_latency_ms, rest_avg_latency_ms, rpc_p95_ms, rest_p95_ms, rpc_rps, rest_rps, efficiency_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      result.iterations,
      result.rpcAvgLatencyMs,
      result.restAvgLatencyMs,
      result.rpcP95Ms,
      result.restP95Ms,
      result.rpcRps,
      result.restRps,
      result.efficiencyPercent
    ];

    try {
      await pool.execute(sql, params);
    } catch (err) {
      // console.error('[DbService] Error saveBenchmarkResult:', err.message);
    }
  }

  /**
   * Mengambil riwayat telemetri dari MySQL
   */
  static async getTelemetryHistory(wanId, limit = 50) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM wan_telemetry_history WHERE wan_id = ? ORDER BY id DESC LIMIT ?',
        [wanId, limit]
      );
      return rows;
    } catch (err) {
      return [];
    }
  }

  /**
   * Mengambil riwayat anomali dari MySQL
   */
  static async getAnomalies(limit = 100) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM anomaly_logs ORDER BY id DESC LIMIT ?',
        [limit]
      );
      return rows;
    } catch (err) {
      return [];
    }
  }
}

module.exports = DbService;

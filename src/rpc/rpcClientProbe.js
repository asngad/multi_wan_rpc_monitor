/**
 * RPC Client Probe Agent
 * Mengumpulkan data telemetri berkala untuk 4 WAN, MikroTik Core Router, dan 16 Linksys EA7500
 * lalu memanggil prosedur remote JSON-RPC 2.0 ke server pusat.
 */

const jayson = require('jayson');
const config = require('../config/default');
const simulator = require('../services/simulator');
const realNetworkProbe = require('../services/realNetworkProbe');

class RpcClientProbe {
  constructor(serverUrl = 'http://127.0.0.1:4000/rpc') {
    this.serverUrl = serverUrl;
    this.client = jayson.Client.http(serverUrl);
    this.timer = null;
    this.isRunning = false;
    this.telemetryIntervalMs = config.server.telemetryIntervalMs || 1000;
    this.stats = {
      callsSent: 0,
      callsSucceeded: 0,
      callsFailed: 0,
      lastLatencyMs: 0
    };
  }

  setServerUrl(serverUrl) {
    this.serverUrl = serverUrl;
    this.client = jayson.Client.http(serverUrl);
  }

  /**
   * Mengirim request RPC generik
   */
  _callRpc(method, payload) {
    return new Promise((resolve, reject) => {
      const startTime = process.hrtime.bigint();
      this.stats.callsSent++;

      this.client.request(method, payload, (err, response) => {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1000000;
        this.stats.lastLatencyMs = Number(latencyMs.toFixed(2));

        if (err) {
          this.stats.callsFailed++;
          return reject(err);
        }
        if (response.error) {
          this.stats.callsFailed++;
          return reject(new Error(response.error.message));
        }

        this.stats.callsSucceeded++;
        resolve({
          result: response.result,
          rpcTransmissionLatencyMs: this.stats.lastLatencyMs
        });
      });
    });
  }

  /**
   * Mengirim telemetri WAN
   */
  sendWanTelemetry(payload) {
    return this._callRpc('ingestWANMetrics', payload);
  }

  /**
   * Mengirim telemetri MikroTik Core Router
   */
  sendMikrotikTelemetry(payload) {
    return this._callRpc('ingestCoreRouterMetrics', payload);
  }

  /**
   * Mengirim telemetri salah satu Router Linksys EA7500
   */
  sendRouterTelemetry(payload) {
    return this._callRpc('ingestRouterMetrics', payload);
  }

  /**
   * Memulai pengumpulan telemetri background
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      try {
        // 1. Telemetri 4 WAN (Citra, Indibiz, Starlink, Starlite)
        for (const wanConfig of config.wanInterfaces) {
          let telemetry = await realNetworkProbe.probeWan(wanConfig);
          if (!telemetry) {
            telemetry = simulator.generateWanTelemetry(wanConfig);
          }
          await this.sendWanTelemetry(telemetry);
        }

        // 2. Telemetri MikroTik Core Router & Load Balancing
        const mikrotikTelemetry = simulator.generateMikrotikTelemetry();
        await this.sendMikrotikTelemetry(mikrotikTelemetry);

        // 3. Telemetri 16 Router Linksys EA7500
        for (const rConfig of config.accessRouters) {
          let rTelemetry = await realNetworkProbe.probeRouter(rConfig);
          if (!rTelemetry) {
            rTelemetry = simulator.generateRouterTelemetry(rConfig);
          }
          await this.sendRouterTelemetry(rTelemetry);
        }
      } catch (err) {
        // Gagal kirim RPC (server dalam proses booting)
      }
    }, this.telemetryIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      telemetryIntervalMs: this.telemetryIntervalMs
    };
  }
}

module.exports = RpcClientProbe;

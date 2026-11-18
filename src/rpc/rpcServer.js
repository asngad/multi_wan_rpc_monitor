/**
 * RPC Server (JSON-RPC 2.0 Handler)
 * Menangani prosedur remote untuk 4 WAN, MikroTik Core Gateway, dan 16 Router Linksys EA7500.
 */

const jayson = require('jayson');
const wanStore = require('../services/wanStore');
const alertService = require('../services/alertService');

class RpcServerModule {
  constructor(socketService = null) {
    this.socketService = socketService;
    this.server = this._createJaysonServer();
  }

  setSocketService(socketService) {
    this.socketService = socketService;
  }

  _createJaysonServer() {
    return new jayson.Server({
      /**
       * Prosedur 1: Ingest telemetri dari 4 WAN (Citra, Indibiz, Starlink, Starlite)
       */
      ingestWANMetrics: (args, callback) => {
        try {
          if (!args || !args.wanId) {
            return callback({ code: -32602, message: 'Parameter tidak valid: wanId wajib diisi' });
          }

          const { wan, evaluation } = wanStore.ingestTelemetry(args);

          if (evaluation.hasAnomaly) {
            evaluation.anomalies.forEach(anomaly => {
              const alertRecord = alertService.recordAlert(wan.id, anomaly);
              if (this.socketService) {
                this.socketService.emit('anomaly_alert', alertRecord);
              }
            });
          }

          if (this.socketService) {
            this.socketService.emit('wan_update', {
              wan,
              evaluation,
              aggregate: wanStore.getAggregateSummary()
            });
          }

          return callback(null, {
            status: 'ACK',
            wanId: wan.id,
            healthScore: wan.healthScore,
            hasAnomaly: evaluation.hasAnomaly,
            timestamp: Date.now()
          });
        } catch (error) {
          return callback({ code: -32000, message: error.message });
        }
      },

      /**
       * Prosedur 2: Ingest telemetri Router MikroTik Core & Load Balancing
       */
      ingestCoreRouterMetrics: (args, callback) => {
        try {
          const mikrotik = wanStore.ingestCoreRouterTelemetry(args);
          if (this.socketService) {
            this.socketService.emit('mikrotik_update', mikrotik);
          }
          return callback(null, { status: 'ACK', mikrotik });
        } catch (error) {
          return callback({ code: -32000, message: error.message });
        }
      },

      /**
       * Prosedur 3: Ingest telemetri dari salah satu Router Linksys EA7500
       */
      ingestRouterMetrics: (args, callback) => {
        try {
          if (!args || !args.id) {
            return callback({ code: -32602, message: 'Parameter tidak valid: id router wajib diisi' });
          }

          const { router, anomalies } = wanStore.ingestRouterTelemetry(args);

          if (anomalies && anomalies.length > 0) {
            anomalies.forEach(a => {
              const alertRec = alertService.recordAlert(router.id, a);
              if (this.socketService) {
                this.socketService.emit('anomaly_alert', alertRec);
              }
            });
          }

          if (this.socketService) {
            this.socketService.emit('router_update', router);
          }

          return callback(null, { status: 'ACK', routerId: router.id, healthScore: router.healthScore });
        } catch (error) {
          return callback({ code: -32000, message: error.message });
        }
      },

      /**
       * Prosedur 4: Ambil status seluruh WAN
       */
      getWANStatus: (args, callback) => {
        try {
          const wans = wanStore.getAllWans();
          const aggregate = wanStore.getAggregateSummary();
          return callback(null, { wans, aggregate });
        } catch (error) {
          return callback({ code: -32000, message: error.message });
        }
      },

      /**
       * Prosedur 5: Ambil seluruh pohon topologi (WANs -> Load Balancer -> MikroTik -> 16 Linksys EA7500)
       */
      getTopologyStatus: (args, callback) => {
        try {
          const tree = wanStore.getTopologyTree();
          return callback(null, tree);
        } catch (error) {
          return callback({ code: -32000, message: error.message });
        }
      },

      /**
       * Prosedur 6: Remote Ping & Heartbeat
       */
      pingRpc: (args, callback) => {
        return callback(null, {
          message: 'PONG',
          serverTime: Date.now(),
          service: 'Multi-WAN & 16-Linksys RPC Telemetry Engine v2.0'
        });
      }
    });
  }

  middleware() {
    return this.server.middleware();
  }
}

module.exports = RpcServerModule;

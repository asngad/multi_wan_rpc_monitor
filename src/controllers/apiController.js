/**
 * REST API Controller
 * Menyediakan endpoint untuk Topologi 4-WAN, MikroTik Core, dan 16 Linksys EA7500
 */

const wanStore = require('../services/wanStore');
const alertService = require('../services/alertService');
const simulator = require('../services/simulator');
const benchmarkService = require('../services/benchmarkService');
const DbService = require('../services/dbService');
const realNetworkProbe = require('../services/realNetworkProbe');
const config = require('../config/default');

class ApiController {
  constructor(rpcProbe = null, socketService = null) {
    this.rpcProbe = rpcProbe;
    this.socketService = socketService;
  }

  setDependencies(rpcProbe, socketService) {
    this.rpcProbe = rpcProbe;
    this.socketService = socketService;
  }

  // GET /api/status
  getStatus(req, res) {
    const wans = wanStore.getAllWans();
    const aggregate = wanStore.getAggregateSummary();
    const mikrotik = wanStore.getMikrotikCore();
    const routers = wanStore.getAllRouters();
    const probeStats = this.rpcProbe ? this.rpcProbe.getStats() : {};
    const scenario = simulator.getActiveScenario();

    res.json({
      success: true,
      wans,
      mikrotik,
      routers,
      aggregate,
      probeStats,
      scenario,
      timestamp: Date.now()
    });
  }

  // GET /api/topology
  getTopology(req, res) {
    res.json({
      success: true,
      topology: wanStore.getTopologyTree()
    });
  }

  // GET /api/routers
  getRouters(req, res) {
    res.json({
      success: true,
      count: wanStore.getAllRouters().length,
      routers: wanStore.getAllRouters()
    });
  }

  // POST /api/routers
  createRouter(req, res) {
    try {
      const newRouter = wanStore.addRouter(req.body);
      if (this.socketService) {
        this.socketService.emit('routers_changed', wanStore.getAllRouters());
      }
      res.status(201).json({
        success: true,
        message: `Router ${newRouter.name} (${newRouter.ip}) berhasil didaftarkan.`,
        router: newRouter
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  // PUT /api/routers/:id
  updateRouter(req, res) {
    try {
      const updated = wanStore.updateRouter(req.params.id, req.body);
      if (this.socketService) {
        this.socketService.emit('router_update', updated);
        this.socketService.emit('routers_changed', wanStore.getAllRouters());
      }
      res.json({
        success: true,
        message: `Router ${updated.name} berhasil diperbarui.`,
        router: updated
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  // DELETE /api/routers/:id
  deleteRouter(req, res) {
    try {
      wanStore.deleteRouter(req.params.id);
      if (this.socketService) {
        this.socketService.emit('routers_changed', wanStore.getAllRouters());
      }
      res.json({
        success: true,
        message: `Router dengan ID ${req.params.id} berhasil dihapus.`
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  // GET /api/mikrotik
  getMikrotik(req, res) {
    res.json({
      success: true,
      mikrotik: wanStore.getMikrotikCore()
    });
  }

  // GET /api/history
  getHistory(req, res) {
    const historyData = {};
    wanStore.getAllWans().forEach(w => {
      historyData[w.id] = {
        name: w.name,
        isp: w.isp,
        color: w.color,
        history: w.history
      };
    });

    res.json({
      success: true,
      history: historyData
    });
  }

  // GET /api/alerts
  getAlerts(req, res) {
    const limit = parseInt(req.query.limit, 10) || 50;
    const alerts = alertService.getAlerts(limit);
    res.json({
      success: true,
      count: alerts.length,
      alerts
    });
  }

  // POST /api/alerts/:id/ack
  acknowledgeAlert(req, res) {
    const success = alertService.acknowledgeAlert(req.params.id);
    res.json({ success });
  }

  // POST /api/simulator/scenario
  setScenario(req, res) {
    const { scenario, durationSeconds = 30 } = req.body;
    const validScenarios = [
      'NORMAL',
      'STARLINK_RAIN_FADE',
      'CITRA_ISP_OUTAGE',
      'LINKSYS_LAB_OVERLOAD',
      'MIKROTIK_HIGH_CPU',
      'WAN_FLAPPING',
      'TRAFFIC_BURST_DDOS'
    ];

    if (!validScenarios.includes(scenario)) {
      return res.status(400).json({
        success: false,
        message: `Skenario tidak valid. Pilih dari: ${validScenarios.join(', ')}`
      });
    }

    const result = simulator.setScenario(scenario, durationSeconds);
    if (this.socketService) {
      this.socketService.emit('scenario_changed', result);
    }

    res.json({
      success: true,
      ...result
    });
  }

  // GET /api/simulator/scenario
  getScenario(req, res) {
    res.json({
      success: true,
      ...simulator.getActiveScenario()
    });
  }

  // POST /api/benchmark/run
  async runBenchmark(req, res) {
    try {
      const iterations = parseInt(req.body.iterations, 10) || 40;
      const port = config.server.port;
      const report = await benchmarkService.runComparison('127.0.0.1', port, iterations);

      // Simpan hasil komparasi ke MySQL
      if (report && report.summary) {
        DbService.saveBenchmarkResult({
          iterations: report.iterations,
          rpcAvgLatencyMs: report.rpc.averageLatencyMs,
          restAvgLatencyMs: report.rest.averageLatencyMs,
          rpcP95Ms: report.rpc.p95LatencyMs,
          restP95Ms: report.rest.p95LatencyMs,
          rpcRps: report.rpc.requestsPerSecond,
          restRps: report.rest.requestsPerSecond,
          efficiencyPercent: report.summary.latencyImprovementPercent
        });
      }

      res.json({
        success: true,
        report
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/db/history
  async getDbHistory(req, res) {
    const wanId = req.query.wanId || 'wan-citra';
    const limit = parseInt(req.query.limit, 10) || 50;
    const records = await DbService.getTelemetryHistory(wanId, limit);
    res.json({
      success: true,
      source: 'MySQL (multi_wan_rpc_db)',
      wanId,
      count: records.length,
      records
    });
  }

  // GET /api/db/anomalies
  async getDbAnomalies(req, res) {
    const limit = parseInt(req.query.limit, 10) || 50;
    const records = await DbService.getAnomalies(limit);
    res.json({
      success: true,
      source: 'MySQL (multi_wan_rpc_db)',
      count: records.length,
      records
    });
  }

  // POST /api/metrics/telemetry
  ingestRestTelemetry(req, res) {
    try {
      const { wan, evaluation } = wanStore.ingestTelemetry(req.body);
      res.json({
        success: true,
        status: 'ACK',
        wanId: wan.id,
        healthScore: wan.healthScore,
        hasAnomaly: evaluation.hasAnomaly
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/config
  getConfig(req, res) {
    res.json({
      success: true,
      config: {
        server: config.server,
        wanInterfaces: config.wanInterfaces,
        loadBalancer: config.loadBalancer,
        mikrotikCore: config.mikrotikCore,
        accessRouters: config.accessRouters,
        anomalyDetection: config.anomalyDetection
      }
    });
  }

  // GET /api/probe/mode
  getProbeMode(req, res) {
    res.json({
      success: true,
      mode: realNetworkProbe.getProbeMode()
    });
  }

  // POST /api/probe/mode
  setProbeMode(req, res) {
    const { mode } = req.body;
    const ok = realNetworkProbe.setProbeMode(mode);
    if (!ok) {
      return res.status(400).json({ success: false, message: 'Mode tidak valid. Pilih dari: SIMULATION, REAL_PROBE, HYBRID_SMART' });
    }
    res.json({
      success: true,
      mode: realNetworkProbe.getProbeMode()
    });
  }

  // POST /api/probe/ping
  async pingHost(req, res) {
    const { ip, timeoutMs = 800 } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, message: 'Parameter IP wajib diisi' });
    }
    const result = await realNetworkProbe.pingHost(ip, timeoutMs);
    res.json({
      success: true,
      ip,
      ...result
    });
  }

  // GET /api/export/csv
  async exportCsv(req, res) {
    try {
      const records = await DbService.getTelemetryHistory('wan-citra', 100);
      let csv = 'ID,WAN_ID,RTT_MS,LOSS_PCT,RX_MBPS,TX_MBPS,HEALTH_SCORE,HAS_ANOMALY,TIMESTAMP\n';
      records.forEach(r => {
        csv += `${r.id},${r.wan_id},${r.rtt},${r.loss},${r.rx_throughput},${r.tx_throughput},${r.health_score},${r.has_anomaly},${r.created_at}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="telemetry_unugha_export.csv"');
      res.status(200).send(csv);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // GET /api/mikrotik/script
  getMikrotikScript(req, res) {
    const multiWanDistributor = require('../services/multiWanDistributor');
    const script = multiWanDistributor.generateMikrotikPccScript();
    if (req.query.format === 'text') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="mikrotik_unugha_pcc_4wan.rsc"');
      return res.send(script);
    }
    res.json({
      success: true,
      filename: 'mikrotik_unugha_pcc_4wan.rsc',
      script
    });
  }

  // GET /api/routers/:id/openwrt-config
  getOpenWrtConfig(req, res) {
    const router = wanStore.getRouter(req.params.id);
    if (!router) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan' });
    }
    const multiWanDistributor = require('../services/multiWanDistributor');
    const configData = multiWanDistributor.generateOpenWrtConfig(router);
    if (req.query.format === 'text') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="network_${router.id}.conf"`);
      return res.send(configData);
    }
    res.json({
      success: true,
      routerId: router.id,
      routerName: router.name,
      config: configData
    });
  }

  // POST /api/probe/verify-all
  async verifyAllInternet(req, res) {
    const routers = wanStore.getAllRouters();
    const mikrotik = wanStore.getMikrotikCore();
    const wans = wanStore.getAllWans();
    const multiWanDistributor = require('../services/multiWanDistributor');

    const checks = await Promise.all(routers.map(async (r) => {
      const pingRes = await realNetworkProbe.pingHost(r.ip, 500);
      const evalAccess = multiWanDistributor.evaluateRouterInternetAccess(r, wans);
      return {
        id: r.id,
        name: r.name,
        ip: r.ip,
        hostAlive: pingRes.alive,
        rttToMikrotikMs: pingRes.alive ? pingRes.rtt : r.rttToMikrotik,
        internetAccess: evalAccess
      };
    }));

    const dnsPing = await realNetworkProbe.pingHost('8.8.8.8', 800);
    const onlineCount = checks.filter(c => c.internetAccess.status === 'ONLINE').length;

    res.json({
      success: true,
      timestamp: Date.now(),
      mikrotik: {
        ip: mikrotik.ip,
        internetDnsPingMs: dnsPing.rtt,
        dnsStatus: dnsPing.alive ? 'REACHABLE' : 'DEGRADED'
      },
      summary: {
        totalRouters: routers.length,
        onlineRouters: onlineCount,
        allConnected: onlineCount === routers.length,
        reachabilityPercent: Number(((onlineCount / routers.length) * 100).toFixed(1))
      },
      results: checks
    });
  }
}

module.exports = new ApiController();

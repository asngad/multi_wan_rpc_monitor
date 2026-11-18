/**
 * WAN, Core MikroTik, and 16 Linksys EA7500 State Store
 * Mengelola status 4 ISP Multi-WAN, Load Balancing PCC, MikroTik Core, dan 16 Router Linksys EA7500.
 */

const config = require('../config/default');
const AnomalyEngine = require('../anomaly/anomalyEngine');
const DbService = require('./dbService');
const multiWanDistributor = require('./multiWanDistributor');

class WanStore {
  constructor() {
    this.historyLimit = 60;
    this.anomalyEngine = new AnomalyEngine();
    
    // 1. Inisialisasi 4 WANs (Citra, Indibiz, Starlink, Starlite)
    this.wans = new Map();
    config.wanInterfaces.forEach(wan => {
      this.wans.set(wan.id, {
        ...wan,
        status: 'UP',
        rtt: wan.baselineLatencyMs,
        jitter: 1.2,
        loss: wan.baselineLossPercent,
        rxThroughput: Number((wan.capacityMbps * 0.35).toFixed(1)),
        txThroughput: Number((wan.capacityMbps * 0.15).toFixed(1)),
        healthScore: 100,
        lastUpdated: Date.now(),
        history: [],
        currentAnomalies: []
      });
    });

    // 2. Inisialisasi MikroTik Core Router
    this.mikrotik = {
      ...config.mikrotikCore,
      status: 'UP',
      cpuUsagePercent: config.mikrotikCore.baselineCpuUsagePercent,
      memoryUsagePercent: config.mikrotikCore.baselineMemoryUsagePercent,
      activeConnections: 12480,
      rttToGateway: 0.45, // sub-ms LAN latency
      loadBalancePcc: {
        method: config.loadBalancer.method,
        distribution: {
          'wan-citra': 26,
          'wan-indibiz': 28,
          'wan-starlink': 31,
          'wan-starlite': 15
        },
        status: 'BALANCED'
      },
      lastUpdated: Date.now()
    };

    // 3. Inisialisasi 16 Router Linksys EA7500 & Distribusi Kampus
    this.routers = new Map();
    config.accessRouters.forEach(r => {
      this.routers.set(r.id, {
        ...r,
        model: r.model || 'Linksys OpenWrt EA7500',
        firmware: r.firmware || 'OpenWrt 23.05.2 r23630',
        status: 'UP',
        rttToMikrotik: Number((1.2 + Math.random() * 0.8).toFixed(1)),
        jitter: Number((0.4 + Math.random() * 0.3).toFixed(1)),
        packetLoss: 0.0,
        activeClients: r.baselineClients,
        clientUtilizationPercent: Math.round((r.baselineClients / r.maxClients) * 100),
        bandwidthRxMbps: Number((8 + Math.random() * 12).toFixed(1)),
        bandwidthTxMbps: Number((2 + Math.random() * 5).toFixed(1)),
        wifi5GhzChannel: 36 + ((parseInt(r.id.split('-')[1], 10) * 4) % 112),
        wifi2GhzChannel: (parseInt(r.id.split('-')[1], 10) % 3 === 0) ? 1 : ((parseInt(r.id.split('-')[1], 10) % 3 === 1) ? 6 : 11),
        healthScore: 98,
        lastUpdated: Date.now(),
        currentAnomalies: []
      });
    });
  }

  // --- GETTERS ---
  getAllWans() {
    return Array.from(this.wans.values());
  }

  getWan(wanId) {
    return this.wans.get(wanId) || null;
  }

  getMikrotikCore() {
    return this.mikrotik;
  }

  getAllRouters() {
    const wans = Array.from(this.wans.values());
    return Array.from(this.routers.values()).map(r => ({
      ...r,
      internetAccess: multiWanDistributor.evaluateRouterInternetAccess(r, wans)
    }));
  }

  getRouter(routerId) {
    const router = this.routers.get(routerId);
    if (!router) return null;
    const wans = Array.from(this.wans.values());
    return {
      ...router,
      internetAccess: multiWanDistributor.evaluateRouterInternetAccess(router, wans)
    };
  }

  /**
   * Menambah router baru secara dinamis
   */
  addRouter(routerData) {
    if (!routerData.id) {
      routerData.id = 'ea7500-' + String(this.routers.size + 1).padStart(2, '0');
    }
    if (this.routers.has(routerData.id)) {
      throw new Error(`Router dengan ID "${routerData.id}" sudah ada.`);
    }

    const newRouter = {
      id: routerData.id,
      slug: routerData.slug || routerData.id.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: routerData.name || routerData.id,
      model: routerData.model || 'Linksys OpenWrt EA7500',
      firmware: routerData.firmware || 'OpenWrt 23.05.2 r23630',
      location: routerData.location || 'Gedung Kampus UNUGHA',
      ip: routerData.ip || '10.0.1.1/24',
      mac: routerData.mac || ('C4:41:1E:06:' + Math.floor(Math.random() * 89 + 10) + ':F1'),
      uplinkPath: routerData.uplinkPath || '012-SW-Rack ➔ WAN',
      downlinkPath: routerData.downlinkPath || 'Area Wi-Fi Klien',
      branchGroup: routerData.branchGroup || 'Gedung Kampus',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: routerData.traceRoute || [
        '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
        'Gateway-LB (10.255.0.1:LAN0)',
        'Virtual device (MikroTik CHR:10.27.42.1)',
        '012-SW-Rack',
        (routerData.name || routerData.id) + ' (' + (routerData.ip || '10.0.1.1') + ')'
      ],
      maxClients: parseInt(routerData.maxClients, 10) || 64,
      baselineClients: parseInt(routerData.baselineClients, 10) || 20,
      activeClients: parseInt(routerData.baselineClients, 10) || 20,
      clientUtilizationPercent: Math.round(((parseInt(routerData.baselineClients, 10) || 20) / (parseInt(routerData.maxClients, 10) || 64)) * 100),
      rttToMikrotik: 1.2,
      jitter: 0.5,
      packetLoss: 0.0,
      bandwidthRxMbps: 12.4,
      bandwidthTxMbps: 3.8,
      wifi5GhzChannel: 44,
      wifi2GhzChannel: 6,
      status: 'UP',
      healthScore: 100,
      currentAnomalies: [],
      lastUpdated: Date.now()
    };

    this.routers.set(newRouter.id, newRouter);
    return newRouter;
  }

  /**
   * Mengupdate data router yang ada
   */
  updateRouter(routerId, updateData) {
    const router = this.routers.get(routerId);
    if (!router) {
      throw new Error(`Router dengan ID "${routerId}" tidak ditemukan.`);
    }

    if (updateData.name) router.name = updateData.name;
    if (updateData.ip) router.ip = updateData.ip;
    if (updateData.location) router.location = updateData.location;
    if (updateData.model) router.model = updateData.model;
    if (updateData.firmware) router.firmware = updateData.firmware;
    if (updateData.uplinkPath) router.uplinkPath = updateData.uplinkPath;
    if (updateData.downlinkPath) router.downlinkPath = updateData.downlinkPath;
    if (updateData.branchGroup) router.branchGroup = updateData.branchGroup;
    if (updateData.maxClients) {
      router.maxClients = parseInt(updateData.maxClients, 10);
      router.clientUtilizationPercent = Math.round((router.activeClients / router.maxClients) * 100);
    }
    if (updateData.traceRoute) router.traceRoute = updateData.traceRoute;
    router.lastUpdated = Date.now();

    return router;
  }

  /**
   * Menghapus router
   */
  deleteRouter(routerId) {
    if (!this.routers.has(routerId)) {
      throw new Error(`Router dengan ID "${routerId}" tidak ditemukan.`);
    }
    return this.routers.delete(routerId);
  }

  // --- TELEMETRY INGESTION VIA RPC ---

  /**
   * Menerima telemetri WAN via RPC
   */
  ingestTelemetry(telemetryPayload) {
    const {
      wanId,
      rtt,
      jitter = 1.0,
      loss = 0,
      rxThroughput = 0,
      txThroughput = 0,
      status = 'UP'
    } = telemetryPayload;

    const wan = this.wans.get(wanId);
    if (!wan) {
      throw new Error(`Antarmuka WAN dengan ID "${wanId}" tidak terdaftar`);
    }

    const allMetrics = this.getAllWans().map(w => ({ wanId: w.id, loss: w.loss }));

    const evaluation = this.anomalyEngine.evaluate({
      wanId,
      rtt,
      loss,
      rxThroughput,
      txThroughput,
      status,
      capacityMbps: wan.capacityMbps,
      baselineLatencyMs: wan.baselineLatencyMs
    }, allMetrics);

    wan.status = status;
    wan.rtt = Number(rtt.toFixed(1));
    wan.jitter = Number(jitter.toFixed(1));
    wan.loss = Number(loss.toFixed(1));
    wan.rxThroughput = Number(rxThroughput.toFixed(2));
    wan.txThroughput = Number(txThroughput.toFixed(2));
    wan.healthScore = evaluation.healthScore;
    wan.currentAnomalies = evaluation.anomalies;
    wan.lastUpdated = Date.now();
    wan.baselines = evaluation.baselines;

    wan.history.push({
      timestamp: Date.now(),
      rtt: wan.rtt,
      jitter: wan.jitter,
      loss: wan.loss,
      rxThroughput: wan.rxThroughput,
      txThroughput: wan.txThroughput,
      totalThroughput: Number((wan.rxThroughput + wan.txThroughput).toFixed(2)),
      healthScore: wan.healthScore,
      hasAnomaly: evaluation.hasAnomaly
    });

    if (wan.history.length > this.historyLimit) {
      wan.history.shift();
    }

    // Simpan ke MySQL secara asinkronus (Non-blocking)
    DbService.saveTelemetry({
      wanId: wan.id,
      rtt: wan.rtt,
      jitter: wan.jitter,
      loss: wan.loss,
      rxThroughput: wan.rxThroughput,
      txThroughput: wan.txThroughput,
      healthScore: wan.healthScore,
      hasAnomaly: evaluation.hasAnomaly,
      rpcMethod: 'ingestWANMetrics'
    });

    if (evaluation.hasAnomaly && evaluation.anomalies) {
      evaluation.anomalies.forEach(anomaly => {
        DbService.saveAnomaly({
          wanId: wan.id,
          type: anomaly.type,
          severity: anomaly.severity,
          zScore: anomaly.zScore,
          metricValue: anomaly.value,
          thresholdValue: anomaly.threshold,
          message: anomaly.message,
          recommendation: anomaly.recommendation
        });
      });
    }

    return { wan, evaluation };
  }

  /**
   * Menerima telemetri MikroTik Core via RPC
   */
  ingestCoreRouterTelemetry(payload) {
    const { cpuUsagePercent, memoryUsagePercent, activeConnections, pccDistribution, status = 'UP' } = payload;
    this.mikrotik.status = status;
    if (typeof cpuUsagePercent === 'number') this.mikrotik.cpuUsagePercent = cpuUsagePercent;
    if (typeof memoryUsagePercent === 'number') this.mikrotik.memoryUsagePercent = memoryUsagePercent;
    if (typeof activeConnections === 'number') this.mikrotik.activeConnections = activeConnections;
    if (pccDistribution) this.mikrotik.loadBalancePcc.distribution = pccDistribution;
    this.mikrotik.lastUpdated = Date.now();
    return this.mikrotik;
  }

  /**
   * Menerima telemetri Router Linksys EA7500 via RPC
   */
  ingestRouterTelemetry(payload) {
    const { id, rttToMikrotik, loss = 0, activeClients, rxMbps, txMbps, status = 'UP' } = payload;
    const router = this.routers.get(id);
    if (!router) {
      throw new Error(`Router Linksys EA7500 dengan ID "${id}" tidak ditemukan`);
    }

    router.status = status;
    if (typeof rttToMikrotik === 'number') router.rttToMikrotik = Number(rttToMikrotik.toFixed(1));
    if (typeof loss === 'number') router.packetLoss = Number(loss.toFixed(1));
    if (typeof activeClients === 'number') {
      router.activeClients = activeClients;
      router.clientUtilizationPercent = Math.round((activeClients / router.maxClients) * 100);
    }
    if (typeof rxMbps === 'number') router.bandwidthRxMbps = Number(rxMbps.toFixed(1));
    if (typeof txMbps === 'number') router.bandwidthTxMbps = Number(txMbps.toFixed(1));

    // Evaluasi kesehatan Linksys EA7500
    const anomalies = [];
    let health = 100;

    if (router.status === 'DOWN') {
      health = 0;
      anomalies.push({
        type: 'ROUTER_DOWN',
        severity: 'CRITICAL',
        message: `Router ${router.name} (${router.location}) tidak dapat dihubungi!`,
        metric: `Status: DOWN, IP: ${router.ip}`,
        recommendation: 'Periksa adaptor daya, kabel LAN uplink ke switch PoE, atau restart router.'
      });
    } else {
      if (router.clientUtilizationPercent >= 90) {
        health -= 25;
        anomalies.push({
          type: 'CLIENT_CONGESTION',
          severity: 'WARNING',
          message: `Kapasitas user Wi-Fi hampir penuh (${router.activeClients}/${router.maxClients} klien aktif).`,
          metric: `Klien: ${router.activeClients} (${router.clientUtilizationPercent}%)`,
          recommendation: 'Rekomendasikan pemasangan secondary AP atau roaming balance di lokasi ini.'
        });
      }
      if (router.rttToMikrotik > 15) {
        health -= 20;
        anomalies.push({
          type: 'UPLINK_LATENCY_HIGH',
          severity: 'WARNING',
          message: `Latensi uplink ke MikroTik meningkat (${router.rttToMikrotik} ms).`,
          metric: `RTT: ${router.rttToMikrotik} ms`,
          recommendation: 'Periksa beban switch distribusi atau kabel UTP/FO.'
        });
      }
    }

    router.healthScore = Math.max(0, health);
    router.currentAnomalies = anomalies;
    router.lastUpdated = Date.now();

    return { router, anomalies };
  }

  // --- AGGREGATE SUMMARY ---
  getAggregateSummary() {
    const wans = this.getAllWans();
    const routers = this.getAllRouters();

    const totalCapacity = wans.reduce((sum, w) => sum + w.capacityMbps, 0);
    const totalRx = wans.reduce((sum, w) => sum + w.rxThroughput, 0);
    const totalTx = wans.reduce((sum, w) => sum + w.txThroughput, 0);
    const activeWans = wans.filter(w => w.status === 'UP').length;
    const avgHealth = Math.round(wans.reduce((sum, w) => sum + w.healthScore, 0) / wans.length);

    const activeRouters = routers.filter(r => r.status === 'UP').length;
    const routersWithInternet = routers.filter(r => r.internetAccess && r.internetAccess.status === 'ONLINE').length;
    const totalConnectedClients = routers.reduce((sum, r) => sum + r.activeClients, 0);

    const dynamicPcc = multiWanDistributor.calculateDynamicPccDistribution(wans);
    this.mikrotik.loadBalancePcc.distribution = dynamicPcc;

    let multiWanStatus = 'OPTIMAL';
    if (activeWans === 0) {
      multiWanStatus = 'DISRUPTED';
    } else if (activeWans < wans.length || avgHealth < 75) {
      multiWanStatus = 'DEGRADED';
    }

    return {
      multiWanStatus,
      totalWans: wans.length,
      activeWans,
      totalCapacityMbps: totalCapacity,
      totalRxThroughputMbps: Number(totalRx.toFixed(2)),
      totalTxThroughputMbps: Number(totalTx.toFixed(2)),
      totalThroughputMbps: Number((totalRx + totalTx).toFixed(2)),
      utilizationPercent: Number((((totalRx + totalTx) / totalCapacity) * 100).toFixed(1)),
      averageHealthScore: avgHealth,
      mikrotikCpu: this.mikrotik.cpuUsagePercent,
      mikrotikConnections: this.mikrotik.activeConnections,
      pccDistribution: dynamicPcc,
      totalRouters: routers.length,
      activeRouters,
      routersWithInternet,
      internetReachabilityPercent: Number(((routersWithInternet / (routers.length || 1)) * 100).toFixed(1)),
      totalConnectedClients,
      timestamp: Date.now()
    };
  }

  /**
   * Mengambil pohon topologi lengkap sesuai skema kampus UNUGHA
   */
  getTopologyTree() {
    return {
      tier1_wans: this.getAllWans(),
      gateway_lb: config.gatewayLB,
      virtual_device: config.virtualDevice,
      core_switch: config.coreSwitch,
      dist_switches: config.distSwitches,
      tier2_loadbalancer: {
        config: config.loadBalancer,
        distribution: this.mikrotik.loadBalancePcc.distribution
      },
      tier3_core: this.getMikrotikCore(),
      tier4_access_routers: this.getAllRouters(),
      aggregate: this.getAggregateSummary()
    };
  }

  reset() {
    this.anomalyEngine.resetAll();
    this.wans.forEach(wan => {
      wan.status = 'UP';
      wan.history = [];
      wan.currentAnomalies = [];
      wan.healthScore = 100;
    });
    this.routers.forEach(r => {
      r.status = 'UP';
      r.currentAnomalies = [];
      r.healthScore = 98;
    });
  }
}

module.exports = new WanStore();

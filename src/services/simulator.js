/**
 * Multi-WAN & 16 Linksys EA7500 Traffic & Anomaly Simulator
 * Mensimulasikan 4 ISP WAN, Load Balancing PCC, MikroTik Core, dan 16 Router Linksys EA7500
 */

const config = require('../config/default');

class SimulatorService {
  constructor() {
    this.activeScenario = 'NORMAL';
    this.scenarioEndTime = 0;
    this.toggleCounter = 0;
    this.flapState = 'UP';
  }

  setScenario(scenario, durationSeconds = 45) {
    this.activeScenario = scenario;
    this.scenarioEndTime = Date.now() + (durationSeconds * 1000);
    this.toggleCounter = 0;
    return {
      scenario: this.activeScenario,
      expiresAt: this.scenarioEndTime,
      durationSeconds
    };
  }

  getActiveScenario() {
    if (this.activeScenario !== 'NORMAL' && Date.now() > this.scenarioEndTime) {
      this.activeScenario = 'NORMAL';
    }
    return {
      activeScenario: this.activeScenario,
      remainingSeconds: Math.max(0, Math.round((this.scenarioEndTime - Date.now()) / 1000))
    };
  }

  /**
   * Menghasilkan data telemetri 4 WAN
   */
  generateWanTelemetry(wanConfig) {
    const { id, baselineLatencyMs, baselineLossPercent, capacityMbps } = wanConfig;

    if (this.activeScenario !== 'NORMAL' && Date.now() > this.scenarioEndTime) {
      this.activeScenario = 'NORMAL';
    }

    const noise = (Math.random() - 0.5) * 1.5;
    let rtt = Math.max(2, baselineLatencyMs + noise);
    let jitter = Math.max(0.2, 1.2 + (Math.random() * 0.8));
    let loss = Math.max(0, baselineLossPercent + (Math.random() * 0.1));
    let rxThroughput = Math.max(1, (capacityMbps * 0.32) + (Math.random() * (capacityMbps * 0.15)));
    let txThroughput = Math.max(0.5, (capacityMbps * 0.12) + (Math.random() * (capacityMbps * 0.08)));
    let status = 'UP';

    // SKENARIO KHUSUS
    switch (this.activeScenario) {
      case 'STARLINK_RAIN_FADE':
        if (id === 'wan-starlink') {
          // Anomali satelit: Badai hujan lebat / rain fade
          rtt = 115 + (Math.random() * 45);
          jitter = 28 + (Math.random() * 15);
          loss = 7.5 + (Math.random() * 5.0);
          rxThroughput = capacityMbps * 0.2; // Throttled
        }
        break;

      case 'CITRA_ISP_OUTAGE':
        if (id === 'wan-citra') {
          status = 'DOWN';
          loss = 100;
          rtt = 0;
          rxThroughput = 0;
          txThroughput = 0;
        } else {
          // Beban failover dialihkan ke Indibiz, Starlink, dan Starlite
          rxThroughput *= 1.35;
          txThroughput *= 1.35;
        }
        break;

      case 'WAN_FLAPPING':
        if (id === 'wan-indibiz') {
          this.toggleCounter++;
          if (this.toggleCounter % 3 === 0) {
            this.flapState = this.flapState === 'UP' ? 'DOWN' : 'UP';
          }
          status = this.flapState;
          if (status === 'DOWN') {
            loss = 100;
            rtt = 0;
            rxThroughput = 0;
            txThroughput = 0;
          }
        }
        break;

      case 'TRAFFIC_BURST_DDOS':
        if (id === 'wan-citra') {
          rxThroughput = capacityMbps * 0.96;
          txThroughput = capacityMbps * 0.08;
          rtt = baselineLatencyMs * 3.5;
          loss = 5.2;
        }
        break;

      case 'NORMAL':
      default:
        break;
    }

    return {
      wanId: id,
      rtt: Number(rtt.toFixed(2)),
      jitter: Number(jitter.toFixed(2)),
      loss: Number(loss.toFixed(2)),
      rxThroughput: Number(rxThroughput.toFixed(2)),
      txThroughput: Number(txThroughput.toFixed(2)),
      status,
      timestamp: Date.now()
    };
  }

  /**
   * Menghasilkan data telemetri MikroTik Core
   */
  generateMikrotikTelemetry() {
    let cpuUsagePercent = 18 + Math.round(Math.random() * 8);
    let memoryUsagePercent = 32 + Math.round(Math.random() * 3);
    let activeConnections = 12500 + Math.round(Math.random() * 2000);
    let status = 'UP';

    let pccDistribution = {
      'wan-citra': 26,
      'wan-indibiz': 28,
      'wan-starlink': 31,
      'wan-starlite': 15
    };

    if (this.activeScenario === 'CITRA_ISP_OUTAGE') {
      // Citra down -> redistribusi 0% ke Citra
      pccDistribution = {
        'wan-citra': 0,
        'wan-indibiz': 42,
        'wan-starlink': 38,
        'wan-starlite': 20
      };
    } else if (this.activeScenario === 'MIKROTIK_HIGH_CPU') {
      cpuUsagePercent = 94 + Math.round(Math.random() * 5);
      memoryUsagePercent = 88 + Math.round(Math.random() * 6);
      activeConnections = 86400 + Math.round(Math.random() * 5000);
    }

    return {
      cpuUsagePercent,
      memoryUsagePercent,
      activeConnections,
      pccDistribution,
      status,
      timestamp: Date.now()
    };
  }

  /**
   * Menghasilkan telemetri untuk 1 dari 16 Router Linksys EA7500
   */
  generateRouterTelemetry(routerConfig) {
    const { id, baselineClients, maxClients } = routerConfig;
    const clientVariation = Math.round((Math.random() - 0.5) * 6);
    let activeClients = Math.max(4, Math.min(maxClients, baselineClients + clientVariation));
    let rttToMikrotik = Number((1.1 + (Math.random() * 0.9)).toFixed(1));
    let loss = 0.0;
    let rxMbps = Number((activeClients * 0.45 + (Math.random() * 2)).toFixed(1));
    let txMbps = Number((activeClients * 0.12 + (Math.random() * 0.8)).toFixed(1));
    let status = 'UP';

    // Skenario khusus Linksys Overload (misal di Lab Komputer 1 ea7500-03)
    if (this.activeScenario === 'LINKSYS_LAB_OVERLOAD' && id === 'ea7500-03') {
      activeClients = 62; // 62 dari 64 kapasitas
      rxMbps = 78.5;
      txMbps = 24.2;
      rttToMikrotik = 22.4;
      loss = 3.5;
    }

    return {
      id,
      rttToMikrotik,
      loss,
      activeClients,
      rxMbps,
      txMbps,
      status,
      timestamp: Date.now()
    };
  }
}

module.exports = new SimulatorService();

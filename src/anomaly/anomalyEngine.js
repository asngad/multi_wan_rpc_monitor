/**
 * Anomaly Detection Engine
 * Mengintegrasikan kalkulasi EWMA, Z-Score statistik, dan aturan domain Multi-WAN.
 */

const EWMAFilter = require('./ewmaFilter');
const ZScoreCalculator = require('./zScore');
const MultiWanRules = require('./multiWanRules');
const config = require('../config/default');

class AnomalyEngine {
  constructor(customConfig = null) {
    this.cfg = customConfig || config.anomalyDetection;
    
    // Peta filter per antarmuka WAN
    this.ewmaLatency = new Map();
    this.ewmaThroughput = new Map();
    this.zScoreLatency = new Map();
    this.zScoreLoss = new Map();
    this.statusHistory = new Map();
  }

  /**
   * Inisialisasi struktur pelacak untuk sebuah WAN jika belum ada
   * @param {string} wanId
   */
  _ensureWanTrackers(wanId) {
    if (!this.ewmaLatency.has(wanId)) {
      this.ewmaLatency.set(wanId, new EWMAFilter(this.cfg.ewma.alpha));
      this.ewmaThroughput.set(wanId, new EWMAFilter(this.cfg.ewma.alpha));
      this.zScoreLatency.set(wanId, new ZScoreCalculator(this.cfg.zScore.windowSize));
      this.zScoreLoss.set(wanId, new ZScoreCalculator(this.cfg.zScore.windowSize));
      this.statusHistory.set(wanId, []);
    }
  }

  /**
   * Melakukan evaluasi deteksi anomali pada data telemetri yang masuk
   * @param {Object} metric - Objek telemetri { wanId, rtt, loss, rxThroughput, txThroughput, status }
   * @param {Array<Object>} allWansCurrentMetrics - Data terkini seluruh WAN untuk perbandingan asymmetric
   * @returns {Object} Laporan evaluasi anomali
   */
  evaluate(metric, allWansCurrentMetrics = []) {
    const { wanId, rtt, loss, rxThroughput, txThroughput, status, capacityMbps, baselineLatencyMs } = metric;
    this._ensureWanTrackers(wanId);

    const totalThroughput = (rxThroughput || 0) + (txThroughput || 0);

    // Update filter dan kalkulator
    const latencyFilter = this.ewmaLatency.get(wanId);
    const throughputFilter = this.ewmaThroughput.get(wanId);
    const latencyZ = this.zScoreLatency.get(wanId);
    const lossZ = this.zScoreLoss.get(wanId);
    const history = this.statusHistory.get(wanId);

    // Simpan riwayat status
    history.push({ status, timestamp: Date.now() });
    if (history.length > 50) history.shift();

    // Hitung baseline EWMA & Z-Score
    const baselineRtt = latencyFilter.update(rtt);
    const baselineBw = throughputFilter.update(totalThroughput);
    const zRtt = latencyZ.calculateZScore(rtt);
    const zLoss = lossZ.calculateZScore(loss);

    // Tambahkan sampel ke window Z-score
    latencyZ.addSample(rtt);
    lossZ.addSample(loss);

    const anomalies = [];
    let severity = 'NORMAL';

    // 1. Cek Apakah Gateway / Link DOWN
    if (status === 'DOWN' || loss >= 99) {
      anomalies.push({
        type: 'GATEWAY_DOWN',
        severity: 'CRITICAL',
        message: `Koneksi antarmuka ${wanId} terputus (DOWN / 100% Packet Loss)!`,
        metric: `Status: ${status}, Loss: ${loss}%`,
        recommendation: 'Lakukan failover otomatis ke gateway sekunder dan hubungi NOC ISP.'
      });
      severity = 'CRITICAL';
    }

    // 2. Deteksi Z-Score Anomaly pada Latensi
    if (status === 'UP' && zRtt >= this.cfg.zScore.thresholdCritical) {
      anomalies.push({
        type: 'LATENCY_SPIKE_ZSCORE',
        severity: 'CRITICAL',
        message: `Lonjakan latensi ekstrem terdeteksi (Z-Score: +${zRtt}σ, RTT: ${rtt}ms vs Baseline: ${baselineRtt}ms)`,
        metric: `RTT: ${rtt}ms, Z-Score: ${zRtt}`,
        recommendation: 'Periksa antrian traffic shaping atau kemungkinan bottleneck di hop gateway.'
      });
      severity = 'CRITICAL';
    } else if (status === 'UP' && zRtt >= this.cfg.zScore.thresholdWarning) {
      anomalies.push({
        type: 'LATENCY_SPIKE_ZSCORE',
        severity: 'WARNING',
        message: `Peningkatan latensi di atas normal (Z-Score: +${zRtt}σ, RTT: ${rtt}ms)`,
        metric: `RTT: ${rtt}ms, Z-Score: ${zRtt}`,
        recommendation: 'Monitor jalur koneksi untuk melihat kemungkinan degradasi lanjutan.'
      });
      if (severity !== 'CRITICAL') severity = 'WARNING';
    }

    // 3. Deteksi Packet Loss
    if (status === 'UP' && loss >= this.cfg.rules.packetLossCriticalPercent) {
      anomalies.push({
        type: 'PACKET_LOSS_CRITICAL',
        severity: 'CRITICAL',
        message: `Tingkat kehilangan paket kritis (${loss}% > ambang batas ${this.cfg.rules.packetLossCriticalPercent}%)`,
        metric: `Packet Loss: ${loss}%`,
        recommendation: 'Alihkan trafik sesi interaktif (VoIP/Streaming) ke antarmuka cadangan.'
      });
      severity = 'CRITICAL';
    } else if (status === 'UP' && loss >= this.cfg.rules.packetLossWarningPercent) {
      anomalies.push({
        type: 'PACKET_LOSS_WARNING',
        severity: 'WARNING',
        message: `Packet loss terdeteksi sebesar ${loss}% (Ambang batas normal: <${this.cfg.rules.packetLossWarningPercent}%)`,
        metric: `Packet Loss: ${loss}%`,
        recommendation: 'Periksa kualitas fisik link optik atau wireless.'
      });
      if (severity !== 'CRITICAL') severity = 'WARNING';
    }

    // 4. Deteksi WAN Flapping
    const flappingResult = MultiWanRules.checkFlapping(
      history,
      this.cfg.rules.flappingTogglesThreshold,
      this.cfg.rules.flappingWindowSeconds
    );
    if (flappingResult.isFlapping) {
      anomalies.push({
        type: 'WAN_FLAPPING',
        severity: 'CRITICAL',
        message: `WAN Flapping terdeteksi! Status berubah ${flappingResult.toggles} kali dalam 60 detik.`,
        metric: `Flapping Count: ${flappingResult.toggles}`,
        recommendation: 'Isolasi antarmuka dari rute failover aktif untuk mencegah flap dampening rute global.'
      });
      severity = 'CRITICAL';
    }

    // 5. Deteksi Saturasi Bandwidth & Bufferbloat
    if (capacityMbps) {
      const sat = MultiWanRules.checkBandwidthSaturation(
        totalThroughput,
        capacityMbps,
        rtt,
        baselineLatencyMs || 15,
        this.cfg.rules.bandwidthSaturationPercent
      );
      if (sat.isBufferbloat) {
        anomalies.push({
          type: 'BANDWIDTH_BUFFERBLOAT',
          severity: 'CRITICAL',
          message: `Kapasitas bandwidth jenuh (${sat.utilizationPercent}%) disertai lonjakan bufferbloat latensi.`,
          metric: `Utilisasi: ${sat.utilizationPercent}%, RTT: ${rtt}ms`,
          recommendation: 'Terapkan queue discipline (FQ-CoDel/CAKE) dan batasi koneksi non-prioritas.'
        });
        severity = 'CRITICAL';
      } else if (sat.isSaturated) {
        anomalies.push({
          type: 'BANDWIDTH_SATURATION',
          severity: 'WARNING',
          message: `Utilisasi bandwidth mendekati kapasitas maksimal (${sat.utilizationPercent}%).`,
          metric: `Throughput: ${totalThroughput.toFixed(1)} / ${capacityMbps} Mbps`,
          recommendation: 'Aktifkan load balance seimbang ke antarmuka WAN alternatif.'
        });
        if (severity !== 'CRITICAL') severity = 'WARNING';
      }
    }

    // 6. Deteksi Asymmetric Loss (Peering ISP issue)
    if (allWansCurrentMetrics && allWansCurrentMetrics.length > 1) {
      const formattedAll = allWansCurrentMetrics.map(w => ({ id: w.wanId, loss: w.loss }));
      const asym = MultiWanRules.checkAsymmetricLoss(
        wanId,
        loss,
        formattedAll,
        this.cfg.rules.asymmetricLossDifferential
      );
      if (asym.isAsymmetric) {
        anomalies.push({
          type: 'ASYMMETRIC_LOSS',
          severity: 'WARNING',
          message: `Asymmetric Packet Loss terdeteksi: Selisih ${asym.lossDifference}% lebih buruk dari WAN lain.`,
          metric: `Delta Loss: +${asym.lossDifference}%`,
          recommendation: 'Kendala terisolasi pada rute transit upstream ISP spesifik ini.'
        });
        if (severity !== 'CRITICAL') severity = 'WARNING';
      }
    }

    // 7. Deteksi Traffic Burst / Potential DDoS Flood
    const burst = MultiWanRules.checkTrafficBurst(totalThroughput, baselineBw);
    if (burst.isBurst) {
      anomalies.push({
        type: 'TRAFFIC_BURST',
        severity: 'WARNING',
        message: `Lonjakan volume trafik abnormal (${burst.ratio}x lipat dari rata-rata baseline EWMA).`,
        metric: `Trafik: ${totalThroughput.toFixed(1)} Mbps vs Baseline: ${baselineBw?.toFixed(1) || 0} Mbps`,
        recommendation: 'Analisis paket flow untuk mendeteksi potensi serangan flood / downloading masif.'
      });
      if (severity !== 'CRITICAL') severity = 'WARNING';
    }

    // Kalkulasi Skor Kesehatan (Health Score 0 - 100)
    let healthScore = 100;
    if (status === 'DOWN') {
      healthScore = 0;
    } else {
      healthScore -= Math.min(40, loss * 2.5); // Penalty loss
      if (zRtt > 0) healthScore -= Math.min(30, zRtt * 8); // Penalty latency deviation
      if (anomalies.length > 0) healthScore -= (anomalies.length * 10);
      healthScore = Math.max(5, Math.min(100, Math.round(healthScore)));
    }

    return {
      wanId,
      timestamp: Date.now(),
      hasAnomaly: anomalies.length > 0,
      severity,
      healthScore,
      anomalies,
      baselines: {
        ewmaRtt: baselineRtt,
        ewmaThroughput: baselineBw,
        zScoreRtt: zRtt,
        zScoreLoss: zLoss
      }
    };
  }

  /**
   * Reset data analitik untuk keperluan pengujian
   */
  resetAll() {
    this.ewmaLatency.clear();
    this.ewmaThroughput.clear();
    this.zScoreLatency.clear();
    this.zScoreLoss.clear();
    this.statusHistory.clear();
  }
}

module.exports = AnomalyEngine;

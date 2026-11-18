/**
 * Aturan Khusus Deteksi Anomali Multi-WAN (Domain Rules)
 * Berfokus pada perilaku khas arsitektur multi-gateway/ISP.
 */

class MultiWanRules {
  /**
   * Mendeteksi WAN Flapping: antarmuka berubah status (UP/DOWN) berulang kali
   * @param {Array<{status: string, timestamp: number}>} statusHistory
   * @param {number} thresholdToggles - Batas jumlah perubahan (misal 3 kali)
   * @param {number} windowSeconds - Jendela waktu pengamatan (misal 60 detik)
   * @returns {{isFlapping: boolean, toggles: number}}
   */
  static checkFlapping(statusHistory, thresholdToggles = 3, windowSeconds = 60) {
    if (!statusHistory || statusHistory.length < 2) {
      return { isFlapping: false, toggles: 0 };
    }

    const now = Date.now();
    const cutoff = now - (windowSeconds * 1000);
    const recent = statusHistory.filter(h => h.timestamp >= cutoff);

    let toggles = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].status !== recent[i - 1].status) {
        toggles++;
      }
    }

    return {
      isFlapping: toggles >= thresholdToggles,
      toggles
    };
  }

  /**
   * Mendeteksi Saturasi Bandwidth & Bufferbloat (Throughput mendekati kapasitas + Latensi melonjak)
   * @param {number} currentThroughputMbps
   * @param {number} capacityMbps
   * @param {number} currentLatencyMs
   * @param {number} baselineLatencyMs
   * @param {number} saturationThresholdPercent
   * @returns {{isSaturated: boolean, utilizationPercent: number, isBufferbloat: boolean}}
   */
  static checkBandwidthSaturation(
    currentThroughputMbps,
    capacityMbps,
    currentLatencyMs,
    baselineLatencyMs,
    saturationThresholdPercent = 90
  ) {
    const utilization = (currentThroughputMbps / capacityMbps) * 100;
    const isSaturated = utilization >= saturationThresholdPercent;
    const isBufferbloat = isSaturated && (currentLatencyMs >= (baselineLatencyMs * 2.0));

    return {
      isSaturated,
      utilizationPercent: Number(utilization.toFixed(1)),
      isBufferbloat
    };
  }

  /**
   * Mendeteksi Asymmetric Loss: Salah satu WAN mengalami packet loss tinggi sementara WAN lainnya normal
   * Mengindikasikan masalah pada peering ISP lokal, bukan masalah LAN internal.
   * @param {string} targetWanId
   * @param {number} targetWanLoss
   * @param {Array<{id: string, loss: number}>} allWansMetrics
   * @param {number} differentialThreshold
   * @returns {{isAsymmetric: boolean, lossDifference: number}}
   */
  static checkAsymmetricLoss(targetWanId, targetWanLoss, allWansMetrics, differentialThreshold = 12.0) {
    const otherWans = allWansMetrics.filter(w => w.id !== targetWanId);
    if (otherWans.length === 0) {
      return { isAsymmetric: false, lossDifference: 0 };
    }

    const avgOtherLoss = otherWans.reduce((sum, w) => sum + w.loss, 0) / otherWans.length;
    const lossDiff = targetWanLoss - avgOtherLoss;

    return {
      isAsymmetric: (targetWanLoss >= 10.0) && (lossDiff >= differentialThreshold),
      lossDifference: Number(lossDiff.toFixed(2))
    };
  }

  /**
   * Mendeteksi Lonjakan Trafik Tiba-Tiba (DDoS Burst / Traffic Surge)
   * @param {number} currentThroughput
   * @param {number} ewmaBaseline
   * @param {number} multiplier
   * @returns {{isBurst: boolean, ratio: number}}
   */
  static checkTrafficBurst(currentThroughput, ewmaBaseline, multiplier = 2.8) {
    if (!ewmaBaseline || ewmaBaseline < 1) {
      return { isBurst: false, ratio: 1.0 };
    }

    const ratio = currentThroughput / ewmaBaseline;
    return {
      isBurst: ratio >= multiplier,
      ratio: Number(ratio.toFixed(2))
    };
  }
}

module.exports = MultiWanRules;

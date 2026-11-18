/**
 * Alert & Incident Service
 * Mengelola riwayat insiden anomali, status peringatan aktif, dan log kronologis.
 */

class AlertService {
  constructor() {
    this.alerts = [];
    this.maxAlerts = 200;
  }

  /**
   * Merekam atau memperbarui insiden anomali
   * @param {string} wanId
   * @param {Object} anomalyItem - { type, severity, message, metric, recommendation }
   * @returns {Object} Alert record
   */
  recordAlert(wanId, anomalyItem) {
    const alertId = `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newAlert = {
      id: alertId,
      wanId,
      type: anomalyItem.type,
      severity: anomalyItem.severity,
      message: anomalyItem.message,
      metric: anomalyItem.metric,
      recommendation: anomalyItem.recommendation,
      status: 'ACTIVE',
      timestamp: Date.now(),
      acknowledged: false
    };

    // Mencegah duplikasi pesan berlebihan dalam 5 detik terakhir untuk tipe yang sama
    const recentDuplicate = this.alerts.find(
      a => a.wanId === wanId && a.type === anomalyItem.type && (Date.now() - a.timestamp) < 5000
    );

    if (recentDuplicate) {
      recentDuplicate.timestamp = Date.now();
      recentDuplicate.metric = anomalyItem.metric;
      return recentDuplicate;
    }

    this.alerts.unshift(newAlert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.pop();
    }

    return newAlert;
  }

  /**
   * Mengambil seluruh riwayat peringatan
   * @param {number} limit
   * @returns {Array<Object>}
   */
  getAlerts(limit = 50) {
    return this.alerts.slice(0, limit);
  }

  /**
   * Mengambil hanya peringatan aktif berkategori CRITICAL atau WARNING
   * @returns {Array<Object>}
   */
  getActiveAlerts() {
    return this.alerts.filter(a => a.status === 'ACTIVE');
  }

  /**
   * Melakukan acknowledgement pada sebuah alert
   * @param {string} alertId
   * @returns {boolean}
   */
  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.status = 'ACKNOWLEDGED';
      return true;
    }
    return false;
  }

  /**
   * Menghapus seluruh riwayat alert
   */
  clearAlerts() {
    this.alerts = [];
  }
}

module.exports = new AlertService();

/**
 * EWMA (Exponentially Weighted Moving Average) Filter
 * Membentuk profil baseline dinamis trafik yang adaptif terhadap perubahan waktu (peak vs off-peak).
 * Rumus: S_t = α * Y_t + (1 - α) * S_{t-1}
 */

class EWMAFilter {
  /**
   * @param {number} alpha - Faktor pembobotan (0 < alpha <= 1)
   */
  constructor(alpha = 0.2) {
    if (alpha <= 0 || alpha > 1) {
      throw new Error('Nilai alpha harus berada di antara 0 dan 1');
    }
    this.alpha = alpha;
    this.currentValue = null;
    this.sampleCount = 0;
  }

  /**
   * Memperbarui nilai EWMA dengan data baru
   * @param {number} value
   * @returns {number} Nilai baseline terbaru
   */
  update(value) {
    if (typeof value !== 'number' || isNaN(value)) {
      return this.currentValue;
    }

    if (this.currentValue === null) {
      this.currentValue = value;
    } else {
      this.currentValue = (this.alpha * value) + ((1 - this.alpha) * this.currentValue);
    }

    this.sampleCount += 1;
    return Number(this.currentValue.toFixed(3));
  }

  /**
   * Mengambil nilai rata-rata tertimbang saat ini
   * @returns {number|null}
   */
  getBaseline() {
    return this.currentValue !== null ? Number(this.currentValue.toFixed(3)) : null;
  }

  /**
   * Reset filter ke kondisi awal
   */
  reset() {
    this.currentValue = null;
    this.sampleCount = 0;
  }
}

module.exports = EWMAFilter;

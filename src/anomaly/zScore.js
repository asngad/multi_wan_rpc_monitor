/**
 * Z-Score Statistical Calculator
 * Menghitung tingkat deviasi nilai saat ini terhadap distribusi historis pada jendela geser (sliding window).
 * Rumus: Z = (X - μ) / σ
 */

class ZScoreCalculator {
  /**
   * @param {number} windowSize - Ukuran jendela geser (jumlah sampel data)
   */
  constructor(windowSize = 25) {
    this.windowSize = windowSize;
    this.window = [];
  }

  /**
   * Menambahkan sampel baru ke dalam jendela geser
   * @param {number} value
   */
  addSample(value) {
    if (typeof value !== 'number' || isNaN(value)) return;
    this.window.push(value);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }
  }

  /**
   * Menghitung nilai mean (μ) dan deviasi standar (σ)
   * @returns {{mean: number, stdDev: number, sampleCount: number}}
   */
  getStatistics() {
    const n = this.window.length;
    if (n === 0) {
      return { mean: 0, stdDev: 0, sampleCount: 0 };
    }

    const sum = this.window.reduce((acc, val) => acc + val, 0);
    const mean = sum / n;

    if (n < 2) {
      return { mean: Number(mean.toFixed(3)), stdDev: 0, sampleCount: n };
    }

    const varianceSum = this.window.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
    const stdDev = Math.sqrt(varianceSum / (n - 1)); // Sampel deviasi standar (Bessel's correction)

    return {
      mean: Number(mean.toFixed(3)),
      stdDev: Number(stdDev.toFixed(3)),
      sampleCount: n
    };
  }

  /**
   * Menghitung nilai Z-Score untuk nilai tertentu berdasarkan riwayat window
   * @param {number} value
   * @returns {number} Z-Score
   */
  calculateZScore(value) {
    const stats = this.getStatistics();
    if (stats.sampleCount < 4 || stats.stdDev === 0) {
      return 0; // Belum cukup data atau varians nol
    }

    const z = (value - stats.mean) / stats.stdDev;
    return Number(z.toFixed(2));
  }

  /**
   * Mengosongkan data jendela
   */
  reset() {
    this.window = [];
  }
}

module.exports = ZScoreCalculator;

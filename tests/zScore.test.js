const ZScoreCalculator = require('../src/anomaly/zScore');

describe('Pengujian Unit Z-Score Statistical Calculator', () => {
  test('Menginisialisasi kalkulator dengan ukuran jendela geser tertentu', () => {
    const calc = new ZScoreCalculator(10);
    expect(calc.windowSize).toBe(10);
    expect(calc.window.length).toBe(0);
  });

  test('Mengembalikan Z-Score = 0 jika sampel masih sedikit (< 4)', () => {
    const calc = new ZScoreCalculator(10);
    calc.addSample(10);
    calc.addSample(12);
    expect(calc.calculateZScore(15)).toBe(0);
  });

  test('Menghitung mean dan deviasi standar dengan benar', () => {
    const calc = new ZScoreCalculator(10);
    // Sampel: [10, 10, 10, 10, 10] -> mean = 10, stdDev = 0
    [10, 10, 10, 10, 10].forEach(v => calc.addSample(v));
    const stats = calc.getStatistics();
    expect(stats.mean).toBe(10);
    expect(stats.stdDev).toBe(0);
    expect(calc.calculateZScore(10)).toBe(0);
  });

  test('Mendeteksi nilai anomali dengan Z-Score positif yang tinggi', () => {
    const calc = new ZScoreCalculator(20);
    // Baseline stabil di kisaran 10 - 12
    const baseline = [10, 11, 10, 12, 10, 11, 10, 11, 10, 12];
    baseline.forEach(v => calc.addSample(v));

    // Nilai normal
    const normalZ = calc.calculateZScore(11);
    expect(Math.abs(normalZ)).toBeLessThan(1.5);

    // Nilai lonjakan ekstrem (anomali) misal 40
    const spikeZ = calc.calculateZScore(40);
    expect(spikeZ).toBeGreaterThanOrEqual(3.0);
  });

  test('Membatasi ukuran window agar tidak melebihi windowSize', () => {
    const calc = new ZScoreCalculator(5);
    for (let i = 1; i <= 10; i++) {
      calc.addSample(i);
    }
    expect(calc.window.length).toBe(5);
    expect(calc.window).toEqual([6, 7, 8, 9, 10]);
  });
});

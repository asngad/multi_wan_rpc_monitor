const EWMAFilter = require('../src/anomaly/ewmaFilter');

describe('Pengujian Unit EWMA (Exponentially Weighted Moving Average)', () => {
  test('Menginisialisasi filter dengan nilai default alpha = 0.2', () => {
    const filter = new EWMAFilter();
    expect(filter.alpha).toBe(0.2);
    expect(filter.getBaseline()).toBeNull();
  });

  test('Melempar error jika nilai alpha di luar rentang (0, 1]', () => {
    expect(() => new EWMAFilter(0)).toThrow();
    expect(() => new EWMAFilter(1.5)).toThrow();
    expect(() => new EWMAFilter(-0.1)).toThrow();
  });

  test('Sampel pertama langsung menjadi baseline awal', () => {
    const filter = new EWMAFilter(0.2);
    const result = filter.update(20);
    expect(result).toBe(20);
    expect(filter.getBaseline()).toBe(20);
  });

  test('Menghitung pemulusan nilai sesuai rumus S_t = α * Y_t + (1 - α) * S_{t-1}', () => {
    const filter = new EWMAFilter(0.2);
    filter.update(10); // S_0 = 10
    // S_1 = (0.2 * 20) + (0.8 * 10) = 4 + 8 = 12
    const s1 = filter.update(20);
    expect(s1).toBe(12);

    // S_2 = (0.2 * 30) + (0.8 * 12) = 6 + 9.6 = 15.6
    const s2 = filter.update(30);
    expect(s2).toBe(15.6);
  });

  test('Fungsi reset mengosongkan baseline ke kondisi awal', () => {
    const filter = new EWMAFilter(0.2);
    filter.update(100);
    expect(filter.getBaseline()).toBe(100);
    filter.reset();
    expect(filter.getBaseline()).toBeNull();
  });
});

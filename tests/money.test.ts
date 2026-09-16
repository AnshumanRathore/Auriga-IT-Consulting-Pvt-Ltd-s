import { describe, expect, it } from 'vitest';
import { distributeProportionally, formatPaise, percentOfPaise, toPaise } from '../src/money';

describe('toPaise / formatPaise', () => {
  it('converts rupees to integer paise', () => {
    expect(toPaise(125.5)).toBe(12550);
    expect(toPaise(0.01)).toBe(1);
  });

  it('formats paise back to a rupee string with grouping', () => {
    expect(formatPaise(12550)).toBe('₹125.50');
    expect(formatPaise(100000)).toBe('₹1,000.00');
  });
});

describe('percentOfPaise', () => {
  it('rounds half up to the nearest paisa', () => {
    expect(percentOfPaise(833, 12)).toBe(100); // 99.96 -> 100
  });
});

describe('distributeProportionally', () => {
  it('always sums back to the exact total', () => {
    const result = distributeProportionally(1001, [333, 333, 334]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it('handles a zero total', () => {
    expect(distributeProportionally(0, [10, 20])).toEqual([0, 0]);
  });

  it('handles all-zero weights without dividing by zero', () => {
    expect(distributeProportionally(100, [0, 0])).toEqual([0, 0]);
  });

  it('distributes an awkward remainder to the largest fractional shares', () => {
    // 10 split 1:1:1 -> ideal 3.33 each; two lines should get 3, one should get 4 (sum = 10)
    const result = distributeProportionally(10, [1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    expect(result.filter((x) => x === 4).length).toBe(1);
  });
});

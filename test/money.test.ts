import { describe, expect, it } from 'vitest';
import { formatAmount } from '../src/services/money.js';

describe('writing an amount one way', () => {
  it('writes rupiah the way Indonesian statements do', () => {
    expect(formatAmount('IDR 2.432.334')).toBe('Rp 2.432.334');
    expect(formatAmount('Rp. 2,741,577.39')).toBe('Rp 2.741.577,39');
    expect(formatAmount('Rp1,284,247,279')).toBe('Rp 1.284.247.279');
    expect(formatAmount('IDR 1,006,507.51')).toBe('Rp 1.006.507,51');
    expect(formatAmount('IDR 1.006.507,51')).toBe('Rp 1.006.507,51');
  });

  it('keeps a foreign currency with its own symbol', () => {
    expect(formatAmount('$611.94')).toBe('$611.94');
    expect(formatAmount('USD 10.00')).toBe('$10.00');
    expect(formatAmount('SGD 1,234.56')).toBe('SGD 1,234.56');
  });

  it('leaves text that is not an amount alone', () => {
    expect(formatAmount('')).toBe('');
    expect(formatAmount(null)).toBe(null);
    expect(formatAmount('see the attached statement')).toBe('see the attached statement');
  });
});

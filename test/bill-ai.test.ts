import { describe, expect, it } from 'vitest';
import { amountWithCurrency, detectCurrency } from '../src/services/bill-ai.js';

describe('reading a bill amount', () => {
  it('finds the currency a bare total omitted', () => {
    expect(detectCurrency('IDR 0.00\nIDR 0.00\nTotal 2.432.334 IDR 0.00')).toBe('IDR');
    expect(detectCurrency('Jumlah Rp2.432.334')).toBe('Rp');
    expect(detectCurrency('Total due 42.00, no currency named')).toBeUndefined();
  });

  it('keeps money the model already named', () => {
    expect(amountWithCurrency('$10.00', 'USD')).toBe('$10.00');
    expect(amountWithCurrency('Rp1.284.247.279', 'IDR')).toBe('Rp1.284.247.279');
  });

  it('puts the document currency in front of a bare number', () => {
    expect(amountWithCurrency('2.432.334', 'IDR')).toBe('IDR 2.432.334');
    expect(amountWithCurrency('2.432.334', 'Rp')).toBe('Rp2.432.334');
    expect(amountWithCurrency('10.00', undefined)).toBe('10.00');
  });
});

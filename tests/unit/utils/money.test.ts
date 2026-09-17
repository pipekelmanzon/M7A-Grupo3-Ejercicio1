import { round2 } from '../../../src/utils/money';

describe('round2', () => {
  it('rounds positive and negative values to two decimals', () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(-12.345)).toBe(-12.34);
  });

  it('normalizes negative zero and rejects non-finite values', () => {
    expect(Object.is(round2(-0.004), -0)).toBe(false);
    expect(() => round2(Number.NaN)).toThrow(TypeError);
    expect(() => round2(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
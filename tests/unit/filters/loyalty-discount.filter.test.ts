import { loyaltyDiscountFilter } from '../../../src/filters/loyalty-discount.filter';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { buildContext } from '../../helpers/context-builder';

const params = defaultPipelineConfig.params['loyalty-discount'];

describe('loyalty-discount filter', () => {
  it('no es crítico y requiere el pasajero y el precio base', () => {
    expect(loyaltyDiscountFilter.critical).toBe(false);
    expect(loyaltyDiscountFilter.requires).toEqual(['passenger', 'pricing.basePrice']);
  });

  it.each([
    ['none', 0],
    ['bronze', 0.05],
    ['silver', 0.1],
    ['gold', 0.15],
  ] as const)('aplica el descuento correspondiente al tier %s', async (loyaltyTier, rate) => {
    const context = buildContext({ passenger: { loyaltyTier }, pricing: { basePrice: 300 } });

    const result = await loyaltyDiscountFilter.run(context, params);

    expect(result.pricing.loyaltyDiscount).toBeCloseTo(300 * rate);
  });

  it('lanza si no hay pasajero en el contexto', async () => {
    const context = buildContext({ passenger: null, pricing: { basePrice: 300 } });

    await expect(loyaltyDiscountFilter.run(context, params)).rejects.toThrow();
  });

  it('lanza si no hay precio base en el contexto', async () => {
    const context = buildContext({ pricing: {} });

    await expect(loyaltyDiscountFilter.run(context, params)).rejects.toThrow();
  });
});

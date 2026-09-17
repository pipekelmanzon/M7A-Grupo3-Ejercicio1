import { basePriceFilter } from '../../../src/filters/base-price.filter';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { buildContext } from '../../helpers/context-builder';

const params = defaultPipelineConfig.params['base-price'];

describe('base-price filter', () => {
  it('es crítico y requiere el vuelo', () => {
    expect(basePriceFilter.critical).toBe(true);
    expect(basePriceFilter.requires).toEqual(['flight']);
  });

  it.each([
    ['economy', 1],
    ['business', 2.5],
    ['first', 4],
  ] as const)('calcula el precio base para %s con su multiplicador', async (seatClass, multiplier) => {
    const context = buildContext({ request: { seatClass }, flight: { basePrice: 300 } });

    const result = await basePriceFilter.run(context, params);

    expect(result.pricing.basePrice).toBeCloseTo(300 * multiplier);
  });

  it('usa los multiplicadores configurados, no valores fijos', async () => {
    const context = buildContext({ request: { seatClass: 'business' }, flight: { basePrice: 100 } });
    const customParams = { economyMultiplier: 1, businessMultiplier: 3, firstMultiplier: 5 };

    const result = await basePriceFilter.run(context, customParams);

    expect(result.pricing.basePrice).toBe(300);
  });

  it('no pisa el resto de los campos de pricing ya calculados', async () => {
    const context = buildContext({ flight: { basePrice: 300 }, pricing: { taxes: 10 } });

    const result = await basePriceFilter.run(context, params);

    expect(result.pricing.taxes).toBe(10);
  });

  it('lanza si no hay vuelo en el contexto, porque el pipeline no debería llamarlo sin esa dependencia', async () => {
    const context = buildContext({ flight: null });

    await expect(basePriceFilter.run(context, params)).rejects.toThrow();
  });
});

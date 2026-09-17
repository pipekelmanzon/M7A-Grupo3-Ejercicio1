import { taxesFilter } from '../../../src/filters/taxes.filter';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { buildContext } from '../../helpers/context-builder';

const params = defaultPipelineConfig.params.taxes;

describe('taxes filter', () => {
  it('no es crítico y requiere el precio base y el subtotal', () => {
    expect(taxesFilter.critical).toBe(false);
    expect(taxesFilter.requires).toEqual(['pricing.basePrice', 'pricing.subtotal']);
  });

  it('calcula impuestos, recargo por combustible, tasa de aeropuerto y total', async () => {
    const context = buildContext({ pricing: { basePrice: 750, subtotal: 637.5 } });

    const result = await taxesFilter.run(context, params);

    expect(result.pricing.taxes).toBeCloseTo(76.5);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(60);
    expect(result.pricing.airportFee).toBe(25);
    expect(result.pricing.total).toBeCloseTo(799);
  });

  it('el recargo por combustible se calcula sobre el precio base, no sobre el subtotal', async () => {
    const context = buildContext({ pricing: { basePrice: 1000, subtotal: 500 } });

    const result = await taxesFilter.run(context, params);

    expect(result.pricing.fuelSurcharge).toBeCloseTo(80);
  });

  it('lanza si no hay subtotal en el contexto', async () => {
    const context = buildContext({ pricing: { basePrice: 300 } });

    await expect(taxesFilter.run(context, params)).rejects.toThrow();
  });

  it('lanza si no hay precio base en el contexto', async () => {
    const context = buildContext({ pricing: { subtotal: 300 } });

    await expect(taxesFilter.run(context, params)).rejects.toThrow();
  });
});

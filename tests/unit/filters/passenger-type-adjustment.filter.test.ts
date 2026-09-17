import { passengerTypeAdjustmentFilter } from '../../../src/filters/passenger-type-adjustment.filter';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { buildContext } from '../../helpers/context-builder';

const params = defaultPipelineConfig.params['passenger-type-adjustment'];

describe('passenger-type-adjustment filter', () => {
  it('no es crítico y requiere el precio base', () => {
    expect(passengerTypeAdjustmentFilter.critical).toBe(false);
    expect(passengerTypeAdjustmentFilter.requires).toEqual(['pricing.basePrice']);
  });

  it('no aplica descuento a un adulto', async () => {
    const context = buildContext({ request: { passengerType: 'adult' }, pricing: { basePrice: 300 } });

    const result = await passengerTypeAdjustmentFilter.run(context, params);

    expect(result.pricing.passengerTypeDiscount).toBe(0);
    expect(result.pricing.subtotal).toBe(300);
  });

  it('aplica el 25% a un niño', async () => {
    const context = buildContext({ request: { passengerType: 'child' }, pricing: { basePrice: 300 } });

    const result = await passengerTypeAdjustmentFilter.run(context, params);

    expect(result.pricing.passengerTypeDiscount).toBeCloseTo(75);
    expect(result.pricing.subtotal).toBeCloseTo(225);
  });

  it('aplica el 15% a un senior', async () => {
    const context = buildContext({ request: { passengerType: 'senior' }, pricing: { basePrice: 300 } });

    const result = await passengerTypeAdjustmentFilter.run(context, params);

    expect(result.pricing.passengerTypeDiscount).toBeCloseTo(45);
    expect(result.pricing.subtotal).toBeCloseTo(255);
  });

  it('calcula el descuento sobre el precio que dejó el descuento de lealtad, no sobre el precio base', async () => {
    const context = buildContext({
      request: { passengerType: 'child' },
      pricing: { basePrice: 300, loyaltyDiscount: 30 },
    });

    const result = await passengerTypeAdjustmentFilter.run(context, params);

    // precio después de lealtad: 270. descuento de niño: 25% de 270 = 67.5
    expect(result.pricing.passengerTypeDiscount).toBeCloseTo(67.5);
    expect(result.pricing.subtotal).toBeCloseTo(202.5);
  });

  it('trata la falta de descuento de lealtad como 0, por si ese filtro está deshabilitado', async () => {
    const context = buildContext({ request: { passengerType: 'adult' }, pricing: { basePrice: 300 } });

    const result = await passengerTypeAdjustmentFilter.run(context, params);

    expect(result.pricing.subtotal).toBe(300);
  });

  it('lanza si no hay precio base en el contexto', async () => {
    const context = buildContext({ pricing: {} });

    await expect(passengerTypeAdjustmentFilter.run(context, params)).rejects.toThrow();
  });
});

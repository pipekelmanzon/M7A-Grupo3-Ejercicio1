import type { Filter } from '../pipeline/filter.ts';
import { withPricing } from '../pipeline/filter.ts';
import type { PipelineConfig } from '../pipeline/pipeline-config.ts';

type TaxesParams = PipelineConfig['params']['taxes'];

/**
 * Calcula el impuesto sobre el subtotal, el recargo por combustible sobre
 * el precio base, suma la tasa fija de aeropuerto y arma el total final.
 *
 * El recargo por combustible se calcula sobre el precio base y no sobre
 * el subtotal, tal como lo pide la letra, así que necesita los dos valores
 * en el contexto.
 */
export const taxesFilter: Filter = {
  name: 'taxes',
  requires: ['pricing.basePrice', 'pricing.subtotal'],
  critical: false,
  async run(context, params) {
    const basePrice = context.pricing.basePrice;
    const subtotal = context.pricing.subtotal;
    // El pipeline garantiza estas dos dependencias antes de llamar al
    // filtro, porque están declaradas en `requires`.
    if (basePrice === undefined || subtotal === undefined) {
      throw new Error('taxes filter requires pricing.basePrice and pricing.subtotal in context');
    }
    const { taxRate, airportFee, fuelSurchargeRate } = params as TaxesParams;
    const taxes = subtotal * taxRate;
    const fuelSurcharge = basePrice * fuelSurchargeRate;

    return withPricing(context, {
      taxes,
      fuelSurcharge,
      airportFee,
      total: subtotal + taxes + fuelSurcharge + airportFee,
    });
  },
};

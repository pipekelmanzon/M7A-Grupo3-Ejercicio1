import type { Filter } from '../pipeline/filter.ts';
import { withPricing } from '../pipeline/filter.ts';
import type { PipelineConfig } from '../pipeline/pipeline-config.ts';

type BasePriceParams = PipelineConfig['params']['base-price'];

/**
 * Calcula el precio base de la reserva: el precio del vuelo multiplicado
 * según la clase del asiento. Economy usa el precio tal cual, Business lo
 * multiplica por 2,5 y First por 4, según los multiplicadores configurados.
 *
 * Es un filtro crítico: sin precio base ningún filtro de precio posterior
 * tiene con qué trabajar, así que una falla acá corta la reserva.
 */
export const basePriceFilter: Filter = {
  name: 'base-price',
  requires: ['flight'],
  critical: true,
  async run(context, params) {
    const flight = context.flight;
    // El pipeline garantiza que `flight` está presente antes de llamar a
    // este filtro, porque lo declara en `requires`.
    if (!flight) {
      throw new Error('base-price filter requires flight in context');
    }
    const { economyMultiplier, businessMultiplier, firstMultiplier } = params as BasePriceParams;
    const multiplierBySeatClass = {
      economy: economyMultiplier,
      business: businessMultiplier,
      first: firstMultiplier,
    };
    const multiplier = multiplierBySeatClass[context.request.seatClass];

    return withPricing(context, { basePrice: flight.basePrice * multiplier });
  },
};

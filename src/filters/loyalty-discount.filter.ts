import type { Filter } from '../pipeline/filter.ts';
import { withPricing } from '../pipeline/filter.ts';
import type { PipelineConfig } from '../pipeline/pipeline-config.ts';

type LoyaltyDiscountParams = PipelineConfig['params']['loyalty-discount'];

/**
 * Aplica el descuento por tier de lealtad sobre el precio base: Bronze 5%,
 * Silver 10% y Gold 15%. Si el pasajero no tiene tier, el descuento es 0.
 *
 * No es crítico: si este filtro falla, el precio sigue calculándose sin
 * descuento de lealtad, y así lo trata el filtro de ajuste por tipo de
 * pasajero que viene después.
 */
export const loyaltyDiscountFilter: Filter = {
  name: 'loyalty-discount',
  requires: ['passenger', 'pricing.basePrice'],
  critical: false,
  async run(context, params) {
    const passenger = context.passenger;
    const basePrice = context.pricing.basePrice;
    // El pipeline garantiza estas dos dependencias antes de llamar al
    // filtro, porque están declaradas en `requires`.
    if (!passenger || basePrice === undefined) {
      throw new Error('loyalty-discount filter requires passenger and pricing.basePrice in context');
    }
    const rates = params as LoyaltyDiscountParams;
    const rate = passenger.loyaltyTier === 'none' ? 0 : rates[passenger.loyaltyTier];

    return withPricing(context, { loyaltyDiscount: basePrice * rate });
  },
};

import type { Filter } from '../pipeline/filter.ts';
import { withPricing } from '../pipeline/filter.ts';
import type { PipelineConfig } from '../pipeline/pipeline-config.ts';

type PassengerTypeAdjustmentParams = PipelineConfig['params']['passenger-type-adjustment'];

/**
 * Aplica el ajuste por tipo de pasajero: Child 25%, Senior 15% y Adult sin
 * descuento. El descuento se calcula en cadena, sobre el precio que dejó
 * el descuento de lealtad y no sobre el precio base. Si ese descuento no
 * se calculó porque el filtro anterior está deshabilitado o falló, se lo
 * trata como 0.
 *
 * Usa `request.passengerType`, el tipo que declaró el cliente y que el
 * filtro de validación de pasajero ya contrastó contra la edad real, en
 * lugar de depender de que el pasajero esté en el contexto.
 */
export const passengerTypeAdjustmentFilter: Filter = {
  name: 'passenger-type-adjustment',
  requires: ['pricing.basePrice'],
  critical: false,
  async run(context, params) {
    const basePrice = context.pricing.basePrice;
    // El pipeline garantiza esta dependencia antes de llamar al filtro,
    // porque está declarada en `requires`.
    if (basePrice === undefined) {
      throw new Error('passenger-type-adjustment filter requires pricing.basePrice in context');
    }
    const loyaltyDiscount = context.pricing.loyaltyDiscount ?? 0;
    const priceAfterLoyalty = basePrice - loyaltyDiscount;
    const { child, senior } = params as PassengerTypeAdjustmentParams;
    const rate = context.request.passengerType === 'child'
      ? child
      : context.request.passengerType === 'senior'
        ? senior
        : 0;
    const passengerTypeDiscount = priceAfterLoyalty * rate;

    return withPricing(context, {
      passengerTypeDiscount,
      subtotal: priceAfterLoyalty - passengerTypeDiscount,
    });
  },
};

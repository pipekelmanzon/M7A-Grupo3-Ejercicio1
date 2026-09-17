import { basePriceFilter } from '../../../src/filters/base-price.filter';
import { loyaltyDiscountFilter } from '../../../src/filters/loyalty-discount.filter';
import { passengerTypeAdjustmentFilter } from '../../../src/filters/passenger-type-adjustment.filter';
import { taxesFilter } from '../../../src/filters/taxes.filter';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { buildContext } from '../../helpers/context-builder';
import type { ReservationContext } from '../../../src/pipeline/context';
import type { LoyaltyTier, PassengerType, SeatClass } from '../../../src/domain/types';

const { params } = defaultPipelineConfig;

/**
 * Corre los cuatro filtros de precio en el orden del pipeline, tal como
 * los ejecutaría el pipeline real, sin pasar por la validación de pasajero
 * ni de vuelo. Estos tests cubren solo el cálculo de precios.
 */
async function priceReservation(input: {
  seatClass: SeatClass;
  passengerType: PassengerType;
  loyaltyTier: LoyaltyTier;
  basePrice: number;
}): Promise<ReservationContext> {
  let context = buildContext({
    request: { seatClass: input.seatClass, passengerType: input.passengerType },
    passenger: { loyaltyTier: input.loyaltyTier },
    flight: { basePrice: input.basePrice },
  });

  context = await basePriceFilter.run(context, params['base-price']);
  context = await loyaltyDiscountFilter.run(context, params['loyalty-discount']);
  context = await passengerTypeAdjustmentFilter.run(context, params['passenger-type-adjustment']);
  context = await taxesFilter.run(context, params.taxes);

  return context;
}

describe('casos de cálculo de precios de la letra', () => {
  it('economy sin descuentos', async () => {
    const { pricing } = await priceReservation({
      seatClass: 'economy',
      passengerType: 'adult',
      loyaltyTier: 'none',
      basePrice: 300,
    });

    expect(pricing.basePrice).toBeCloseTo(300);
    expect(pricing.loyaltyDiscount).toBe(0);
    expect(pricing.passengerTypeDiscount).toBe(0);
    expect(pricing.subtotal).toBeCloseTo(300);
    expect(pricing.taxes).toBeCloseTo(36);
    expect(pricing.fuelSurcharge).toBeCloseTo(24);
    expect(pricing.airportFee).toBe(25);
    expect(pricing.total).toBeCloseTo(385);
  });

  it('pasajero Gold con descuento por lealtad', async () => {
    const { pricing } = await priceReservation({
      seatClass: 'economy',
      passengerType: 'adult',
      loyaltyTier: 'gold',
      basePrice: 300,
    });

    expect(pricing.loyaltyDiscount).toBeCloseTo(45);
    expect(pricing.passengerTypeDiscount).toBe(0);
    expect(pricing.subtotal).toBeCloseTo(255);
    // subtotal 255 + impuesto 30,6 (12% de 255) + combustible 24 (8% de 300) + tasa de aeropuerto 25
    expect(pricing.total).toBeCloseTo(334.6);
  });

  it('niño en clase business con descuentos combinados', async () => {
    const { pricing } = await priceReservation({
      seatClass: 'business',
      passengerType: 'child',
      loyaltyTier: 'silver',
      basePrice: 300,
    });

    expect(pricing.basePrice).toBeCloseTo(750);
    expect(pricing.loyaltyDiscount).toBeCloseTo(75);
    // precio después de lealtad: 675. descuento de niño: 25% de 675 = 168.75
    expect(pricing.passengerTypeDiscount).toBeCloseTo(168.75);
    expect(pricing.subtotal).toBeCloseTo(506.25);
    expect(pricing.total).toBeCloseTo(652);
  });

  it('senior en primera clase con múltiples ajustes', async () => {
    const { pricing } = await priceReservation({
      seatClass: 'first',
      passengerType: 'senior',
      loyaltyTier: 'gold',
      basePrice: 500,
    });

    expect(pricing.basePrice).toBeCloseTo(2000);
    expect(pricing.loyaltyDiscount).toBeCloseTo(300);
    // precio después de lealtad: 1700. descuento de senior: 15% de 1700 = 255
    expect(pricing.passengerTypeDiscount).toBeCloseTo(255);
    expect(pricing.subtotal).toBeCloseTo(1445);
    expect(pricing.total).toBeCloseTo(1803.4);
  });
});

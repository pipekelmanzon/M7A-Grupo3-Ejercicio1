import type { Passenger } from '../domain/types.ts';

/**
 * P001-P006: casos válidos que cubren cada nivel de lealtad y tipo de pasajero.
 * P007-P010: un caso inválido por pasajero, para probar cada rechazo por separado.
 */
export const mockPassengers: Passenger[] = [
  { id: 'P001', name: 'Ana Rodríguez', age: 35, type: 'adult', email: 'ana.rodriguez@example.com', active: true, loyaltyTier: 'gold', countryCode: 'UY' },
  { id: 'P002', name: 'Bruno Fernández', age: 29, type: 'adult', email: 'bruno.fernandez@example.com', active: true, loyaltyTier: 'silver', countryCode: 'AR' },
  { id: 'P003', name: 'Carla Silva', age: 41, type: 'adult', email: 'carla.silva@example.com', active: true, loyaltyTier: 'bronze', countryCode: 'BR' },
  { id: 'P004', name: 'David Smith', age: 50, type: 'adult', email: 'david.smith@example.com', active: true, loyaltyTier: 'none', countryCode: 'US' },
  { id: 'P005', name: 'Emma Pérez', age: 8, type: 'child', email: 'emma.perez@example.com', active: true, loyaltyTier: 'none', countryCode: 'UY' },
  { id: 'P006', name: 'Francisco Gómez', age: 70, type: 'senior', email: 'francisco.gomez@example.com', active: true, loyaltyTier: 'silver', countryCode: 'US' },
  { id: 'P007', name: 'Gonzalo Ibáñez', age: 33, type: 'adult', email: 'gonzalo.ibanez@example.com', active: false, loyaltyTier: 'none', countryCode: 'UY' },
  { id: 'P008', name: 'Helena Duarte', age: 27, type: 'adult', email: 'helena.duarte-sin-arroba', active: true, loyaltyTier: 'none', countryCode: 'AR' },
  { id: 'P009', name: '', age: 38, type: 'adult', email: 'nombre.vacio@example.com', active: true, loyaltyTier: 'none', countryCode: 'BR' },
  { id: 'P010', name: 'Iván Castro', age: 30, type: 'adult', email: 'ivan.castro@example.com', active: true, loyaltyTier: 'none', countryCode: 'UY' },
];

export type SeatClass = 'economy' | 'business' | 'first';
export type PassengerType = 'adult' | 'child' | 'senior';
export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface Passenger {
  id: string;
  name: string;
  age: number;
  type: PassengerType;
  email: string;
  active: boolean;
  loyaltyTier: LoyaltyTier;
  countryCode: string;
}

export interface Flight {
  code: string;
  origin: string;
  destination: string;
  destinationCountryCode: string;
  departureDate: string;
  basePrice: number;
  availableSeats: number;
  durationMinutes: number;
}

export interface ReservationRequest {
  reservationId: string;
  passengerId: string;
  flightCode: string;
  origin: string;
  destination: string;
  departureDate: string;
  seatClass: SeatClass;
  passengerType: PassengerType;
}
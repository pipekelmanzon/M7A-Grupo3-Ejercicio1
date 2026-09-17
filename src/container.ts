import { loadEnv, type Env } from './config/env.ts';
import { basePriceFilter } from './filters/base-price.filter.ts';
import { ExchangeRateFilter } from './filters/exchange-rate.filter.ts';
import { createFlightValidationFilter } from './filters/flight-validation.filter.ts';
import { loyaltyDiscountFilter } from './filters/loyalty-discount.filter.ts';
import { createPassengerValidationFilter } from './filters/passenger-validation.filter.ts';
import { passengerTypeAdjustmentFilter } from './filters/passenger-type-adjustment.filter.ts';
import { taxesFilter } from './filters/taxes.filter.ts';
import type { Filter } from './pipeline/filter.ts';
import { createFilterRegistry } from './pipeline/filter-registry.ts';
import { Pipeline } from './pipeline/pipeline.ts';
import { PipelineConfigStore } from './pipeline/pipeline-config.store.ts';
import { InMemoryFlightRepository, type FlightRepository } from './repositories/flight.repository.ts';
import { InMemoryPassengerRepository, type PassengerRepository } from './repositories/passenger.repository.ts';
import { ProcessingStatusRepository } from './repositories/processing-status.repository.ts';
import { ExchangeRateApiProvider } from './services/exchange-rate-api.provider.ts';
import type { ExchangeRateProvider } from './services/exchange-rate.provider.ts';
import { ExchangeRateService } from './services/exchange-rate.service.ts';
import { ReservationProcessingService } from './services/reservation-processing.service.ts';
import { logger } from './utils/logger.ts';

/**
 * Raiz de composicion: el unico lugar que conoce las implementaciones
 * concretas. Todo lo demas depende de interfaces, y los tests reemplazan
 * cualquier pieza por un doble de prueba a traves de `overrides`.
 */
export interface ContainerOverrides {
  env?: Env;
  passengerRepository?: PassengerRepository;
  flightRepository?: FlightRepository;
  statusRepository?: ProcessingStatusRepository;
  configStore?: PipelineConfigStore;
  /** Reemplazar el proveedor alcanza para probar cache, reintentos y respaldo. */
  exchangeRateProvider?: ExchangeRateProvider;
  exchangeRateService?: ExchangeRateService;
  /** Filtros de prueba para los casos de excepcion y de contexto corrupto. */
  extraFilters?: readonly Filter[];
}

export interface Container {
  env: Env;
  passengerRepository: PassengerRepository;
  flightRepository: FlightRepository;
  statusRepository: ProcessingStatusRepository;
  configStore: PipelineConfigStore;
  exchangeRateService: ExchangeRateService;
  filters: Filter[];
  pipeline: Pipeline;
  processingService: ReservationProcessingService;
}

export function createContainer(overrides: ContainerOverrides = {}): Container {
  const env = overrides.env ?? loadEnv();
  const passengerRepository = overrides.passengerRepository ?? new InMemoryPassengerRepository();
  const flightRepository = overrides.flightRepository ?? new InMemoryFlightRepository();
  const statusRepository = overrides.statusRepository ?? new ProcessingStatusRepository();
  const configStore = overrides.configStore ?? new PipelineConfigStore();

  const exchangeRateProvider = overrides.exchangeRateProvider ?? new ExchangeRateApiProvider();
  // El servicio recibe el logger del proyecto en lugar de su `console` por
  // defecto, para que quede en silencio cuando NODE_ENV es test.
  const exchangeRateService = overrides.exchangeRateService ?? new ExchangeRateService(exchangeRateProvider, logger);

  const filters: Filter[] = createFilterRegistry([
    createPassengerValidationFilter(passengerRepository),
    createFlightValidationFilter(flightRepository),
    new ExchangeRateFilter(exchangeRateService),
    basePriceFilter,
    loyaltyDiscountFilter,
    passengerTypeAdjustmentFilter,
    taxesFilter,
  ]);
  // Los filtros de prueba van despues del orden de la letra: no tienen lugar
  // en FILTER_ORDER y solo los usan los tests de excepcion y de contexto
  // corrupto, que los inyectan por la raiz de composicion (ADR-003).
  filters.push(...(overrides.extraFilters ?? []));

  const pipeline = new Pipeline(filters, configStore);
  const processingService = new ReservationProcessingService(pipeline, statusRepository);

  return {
    env, passengerRepository, flightRepository, statusRepository, configStore,
    exchangeRateService, filters, pipeline, processingService,
  };
}

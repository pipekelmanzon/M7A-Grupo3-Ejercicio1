# Plan de implementación

Sistema de Reservas de Vuelos con Pipes and Filters. Ejercicio de Aplicación 1, Grupo 3 de M7A.

Este plan baja a pasos concretos lo que está decidido en [docs/](docs/README.md). La referencia principal es la letra del ejercicio. Cuando el plan menciona un comportamiento, la justificación está en la vista o el ADR que se indica.

## 0. Decisiones ya tomadas

- **Patrón.** Pipes and Filters en proceso, con un contexto inmutable por reserva y validación del contexto en cada pipe. Ver [ADR-001](docs/adr/ADR-001-instanciacion-pipes-and-filters.md).
- **Orden de los filtros.** Es el literal de la letra. El filtro 3 guarda la tasa, los filtros de precio calculan en USD y el total en moneda local se arma al final.
- **Tipo de cambio.** ExchangeRate-API, con caché de una hora, una sola llamada en curso, timeout de 5 s, hasta 3 intentos y respaldo primero a la caché vencida y después a USD. Ver [ADR-002](docs/adr/ADR-002-resiliencia-api-tipo-de-cambio.md).
- **Errores.** Una reserva rechazada por validación se corta. Una excepción en un filtro crítico corta la reserva, y en uno no crítico sigue con estado `error`. El lote responde 200. Ver [ADR-003](docs/adr/ADR-003-politica-de-errores-del-pipeline.md).
- **Stack.**
  - Node.js 22.18 o superior, TypeScript estricto, Express 5 y Zod 4.
  - Jest 30 con babel-jest y Supertest.
  - Sin librerías de HTTP ni de reintentos.
- **Supuestos de cálculo.**
  - El precio base es el precio del vuelo por el multiplicador de la clase.
  - Los descuentos se aplican en cadena.
  - El combustible es el 8 % del precio base y el impuesto el 12 % del subtotal.
  - Se redondea solo al final.

## 1. Estructura inicial del proyecto

1. **Proyecto.** Crear `package.json` con `"type": "module"` y `engines.node >= 22.18`, y estos scripts:

   | Script | Qué hace |
   |---|---|
   | `dev` | Corre `node --env-file-if-exists=.env --watch src/index.ts` |
   | `build` | Compila con `tsc` |
   | `start` | Ejecuta `dist/index.js` |
   | `typecheck` | Chequea los tipos sin generar archivos |
   | `test` | Corre `jest` |
   | `test:coverage` | Corre los tests con reporte de cobertura |
   | `verify` | Corre `typecheck` y después `test` |

2. **Dependencias de producción.** `express` y `zod`.
3. **Dependencias de desarrollo.** `typescript`, `@types/node`, `@types/express`, `jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`, `@types/jest`, `supertest` y `@types/supertest`.
4. **TypeScript.** `tsconfig.json` en modo estricto, con `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module NodeNext`, `allowImportingTsExtensions` y `rewriteRelativeImportExtensions`. Además, `tsconfig.test.json` para los tests.
5. **Configuración de Jest y Babel.** `jest.config.cjs` y `babel.config.cjs`, con los tests en `tests/**/*.test.ts`.
6. **Archivos auxiliares.**
   - `.gitignore` con `node_modules`, `dist`, `coverage` y `.env`.
   - `.env.example` con `PORT`, `NODE_ENV`, `EXCHANGE_API_BASE_URL`, `EXCHANGE_API_TIMEOUT_MS`, `EXCHANGE_API_MAX_ATTEMPTS` y `EXCHANGE_CACHE_TTL_SECONDS`.
7. **Carpetas.** Crear las de la [vista de módulos](docs/vistas/03-modulos.md#14-estructura-de-archivos).

Resultado esperado: `npm run typecheck` y `npm test` corren sin errores sobre un proyecto vacío.

## 2. Base: dominio, configuración y utilidades

1. **`src/domain/types.ts`.**
   - `SeatClass` es `economy`, `business` o `first`.
   - `PassengerType` es `adult`, `child` o `senior`.
   - `LoyaltyTier` es `none`, `bronze`, `silver` o `gold`.
   - También van las interfaces `Passenger` y `Flight`.
2. **`src/config/env.ts`.** Valida el entorno con Zod: el timeout va entre 100 y 5000, los intentos entre 1 y 3, y el TTL por defecto es 3600.
3. **Utilidades en `src/utils/`.**

   | Archivo | Contenido |
   |---|---|
   | `http-error.ts` | Error con status HTTP y `details` opcionales |
   | `logger.ts` | Una línea JSON por evento, silenciada cuando `NODE_ENV` es `test` |
   | `retry.ts` | `retry(fn, { attempts, delaysMs, shouldRetry, onFailedAttempt })` |
   | `money.ts` | `round2` |

## 3. Datos mock y repositorios

**`src/data/mockPassengers.ts`.** Unos 10 pasajeros:

| Id | Caso que cubre |
|---|---|
| P001 | Adulto activo, Gold, Uruguay |
| P002 | Adulto activo, Silver, Argentina |
| P003 | Adulto activo, Bronze, Brasil |
| P004 | Adulto activo, sin tier, Estados Unidos |
| P005 | Niño de 8 años, activo, sin tier |
| P006 | Senior de 70 años, activo, Silver |
| P007 | Inactivo |
| P008 | Email inválido |
| P009 | Nombre vacío |
| P010 | Adulto de 30 años, para probar la incoherencia de declararlo child |

**`src/data/mockFlights.ts`.** Unos 8 vuelos, con fechas calculadas en relación con el arranque:

| Código | Ruta | Caso que cubre |
|---|---|---|
| AA001 | JFK a MIA, Estados Unidos | Destino en USD, sin conversión real |
| LA4567 | MVD a GRU, Brasil | Conversión a BRL |
| AR1140 | EZE a MAD, España | Conversión a EUR |
| IB6844 | MAD a EZE, Argentina | Conversión a ARS |
| UX0045 | MVD a MAD | Con 0 asientos disponibles |
| CM0201 | PTY a MVD | Con 2 asientos disponibles |
| AA0999 | Con fecha pasada | Validación de fecha |
| JL0006 | A un país que no está en la tabla de monedas | Warning `CURRENCY_NOT_SUPPORTED` |

Los vuelos tienen distintos precios base y duraciones. Los datos mock tienen que ser fáciles de modificar, como pide la letra.

**`src/data/country-currency.ts`.** Tabla de país a moneda: AR con ARS, BR con BRL, US con USD, EU con EUR, ES con EUR, UY con UYU, CL con CLP, MX con MXN, PA con USD y GB con GBP.

**Repositorios.**

| Archivo | Contenido |
|---|---|
| `passenger.repository.ts` | Interfaz más implementación en memoria |
| `flight.repository.ts` | Interfaz más implementación en memoria |
| `processing-status.repository.ts` | Un `Map` por `reservationId`, con `save`, `get` y `clear` |

## 4. Núcleo del pipeline

1. **`pipeline/context.ts`.**
   - Tipos `ReservationContext`, `PriceBreakdown`, `CurrencyConversion`, `Issue`, `TraceEntry` y `ProcessingStatus`.
   - `createInitialContext(request)`.
2. **`pipeline/filter.ts`.**
   - La interfaz `Filter`, con `name`, `requires`, `critical` y `run(ctx, params)`.
   - Helpers puros: `reject(ctx, code, message)`, `warn(ctx, code, message)` y `withPricing(ctx, parcial)`. Cada uno devuelve un contexto nuevo.
3. **`pipeline/context.schema.ts`.** El esquema Zod del contexto: tipos correctos, importes finitos y no negativos, y `request` presente.
4. **`pipeline/pipeline-config.ts`.**
   - Esquema Zod de la configuración: cada filtro con `enabled` y sus `params`, más `exchange` con `timeoutMs` y `maxAttempts`, más `validateContextBetweenFilters`.
   - Los valores por defecto de la letra.
5. **`pipeline/pipeline-config.store.ts`.** `get`, `replace` y `reset`. Además, `findBrokenDependencies(config)` para avisar en el PUT.
6. **`pipeline/filter-registry.ts`.** La lista ordenada de filtros que recibe el pipeline.
7. **`pipeline/pipeline.ts`.**
   - `run(ctx)` sigue exactamente el [diagrama de actividad](docs/vistas/04-comportamiento.md#13-ejecución-de-un-filtro-dentro-del-pipeline): cortada, deshabilitado, dependencias, ejecución con `try/catch`, validación, rechazo y traza con `performance.now()`.
   - `use(filter)`, al estilo visto en clase.
8. **`pipeline/result-builder.ts`.**
   - Arma el resultado público y redondea a dos decimales.
   - Calcula `localPricing` con la tasa de la metadata.
   - Decide el estado final.

## 5. Filtros

Cada filtro va en su archivo y se prueba en su archivo. El orden de implementación sugerido va de los más simples a los más complejos.

| Orden | Filtro | Crítico | Requiere | Reglas |
|---|---|---|---|---|
| 1 | `base-price.filter.ts` | Sí | `flight` | Multiplicadores configurables: 1, 2,5 y 4 |
| 2 | `loyalty-discount.filter.ts` | No | `passenger`, `pricing.basePrice` | 5 %, 10 % y 15 %. Si no tiene tier, 0 |
| 3 | `passenger-type-adjustment.filter.ts` | No | `pricing.basePrice` | Se aplica sobre el precio después de la lealtad: child 25 %, senior 15 %. Calcula `subtotal` |
| 4 | `taxes.filter.ts` | No | `pricing.subtotal` | 12 % del subtotal, 25 fijos de aeropuerto, 8 % del precio base y `total` |
| 5 | `passenger-validation.filter.ts` | Sí | Nada | Existe, está activo, email válido con Zod, nombre no vacío, y la edad coincide con el tipo: menor de 12 child, mayor de 65 senior |
| 6 | `flight-validation.filter.ts` | Sí | Nada | Existe, tiene asientos, el origen y el destino coinciden, la fecha coincide y es futura |
| 7 | `exchange-rate.filter.ts` | No | `flight` | Moneda del país de destino, `getRates`, conversión del precio base y warnings según `source` |

Si el tipo de pasajero es adult pero el pasajero tiene menos de 12 o más de 65 años, también es incoherencia.

Si falla el filtro de lealtad, el de tipo de pasajero parte del precio base. Para eso usa `loyaltyDiscount` como 0 cuando falta.

## 6. Servicio y proveedor de tipo de cambio

1. **`schemas/exchange-rate.schema.ts`.** Valida `base`, `date` y `rates` como registro de números positivos.
2. **`services/exchange-rate-api.provider.ts`.**
   - Implementa `ExchangeRateProvider`.
   - Hace el `fetch` con `AbortSignal.timeout`.
   - Clasifica los errores como `timeout`, `network`, `http` con su status, o `invalid-response`.
3. **`services/exchange-rate.service.ts`.**
   - Sigue el [ADR-002](docs/adr/ADR-002-resiliencia-api-tipo-de-cambio.md): caché con TTL que conserva las entradas vencidas, `Map` de promesas en curso, reintento con `utils/retry`, logging y respaldo.
   - `getRates(base)` devuelve `{ rates, source, ratesDate }` y nunca lanza.
   - `invalidateCache()`.
   - Recibe un reloj inyectable para probar el vencimiento sin esperar una hora.

## 7. Procesamiento y capa HTTP

1. **`schemas/reservation.schema.ts`.**
   - Esquema del lote: `reservations` es un array de entre 1 y 100 elementos.
   - Esquema de cada reserva.
   - La validación es en dos niveles: el lote tiene que ser un array y cada elemento se valida por separado. Así una reserva mal formada no tumba el lote.
2. **`services/reservation-processing.service.ts`.** Contextos iniciales, estado `processing`, `Promise.all` sobre el pipeline, guardado de resultados, resumen por estado y `processingTimeMs`.
3. **`container.ts`.**
   - `createContainer(overrides)` arma repositorios, proveedor, servicio, filtros, pipeline y almacenes.
   - Los tests pasan dobles de prueba por `overrides`.
4. **`app.ts`.**
   - `createApp(container)` configura `express.json({ limit: '1mb' })`, el logger de peticiones, las rutas, el 404 y el manejador de errores.
   - Incluye `GET /health`.
5. **Rutas y controladores.**

   | Endpoint | Respuesta |
   |---|---|
   | `POST /reservations/process` | 200 con el reporte, o 400 si no es un lote |
   | `GET /reservations/:id/status` | 200 con el último resultado, o 404 |
   | `GET /pipeline/config` | 200 con la configuración y el orden de filtros |
   | `PUT /pipeline/config` | 200 con la configuración nueva y `warnings` de dependencias, o 400 con `details` |
   | `DELETE /exchange-rates/cache` | 204 |

6. **`index.ts`.** Arranca el servidor y hace el cierre ordenado ante `SIGINT` y `SIGTERM`.

Ejemplo del cuerpo de entrada:

```json
{
  "reservations": [
    {
      "reservationId": "R-1001",
      "passengerId": "P001",
      "flightCode": "LA4567",
      "origin": "MVD",
      "destination": "GRU",
      "departureDate": "2026-10-15",
      "seatClass": "business",
      "passengerType": "adult"
    }
  ]
}
```

Forma de la salida:

```json
{
  "data": {
    "processingTimeMs": 12.4,
    "summary": { "total": 1, "completed": 1, "completedWithWarnings": 0, "rejected": 0, "error": 0 },
    "results": [
      {
        "reservationId": "R-1001",
        "status": "completed",
        "pricing": {
          "currency": "USD",
          "basePrice": 750, "loyaltyDiscount": 112.5, "passengerTypeDiscount": 0,
          "subtotal": 637.5, "taxes": 76.5, "fuelSurcharge": 60, "airportFee": 25, "total": 799
        },
        "localPricing": { "currency": "BRL", "rate": 5.4, "total": 4314.6 },
        "metadata": { "currencyConversion": { "from": "USD", "to": "BRL", "rate": 5.4, "source": "api", "originalBasePrice": 300, "convertedBasePrice": 1620 } },
        "errors": [],
        "warnings": [],
        "trace": [ { "filter": "passenger-validation", "outcome": "ok", "durationMs": 0.2 } ]
      }
    ]
  }
}
```

La traza del ejemplo está recortada: en la respuesta real aparecen los siete filtros. Los valores numéricos son ilustrativos, y el precio de vuelo supuesto es 300 USD.

## 8. Tests

**Tests unitarios.**

| Archivo | Qué cubre |
|---|---|
| `tests/unit/filters/*.test.ts` | Un archivo por filtro, con caso válido, cada rechazo o regla y parámetros configurados. Sin Express ni red |
| `tests/unit/pipeline/pipeline.test.ts` | Orden, filtro deshabilitado, corte, dependencia faltante en filtro crítico y no crítico, excepción en filtro crítico y no crítico, contexto corrupto y traza |
| `tests/unit/pipeline/result-builder.test.ts` | Redondeo, moneda local y estado final |
| `tests/unit/services/exchange-rate.service.test.ts` | Caché vigente, vencimiento con reloj simulado, reintento que se recupera en el intento 2 o 3, timeout, falla de red, respuesta inválida sin reintento, respaldo a caché vencida, respaldo a USD, llamadas simultáneas que comparten una sola llamada, e invalidación |
| `tests/unit/services/exchange-rate-api.provider.test.ts` | Clasificación de errores con `fetch` simulado |

**Tests de integración con Supertest.** Se escribe un test por cada caso de la letra:

| Caso de la letra | Test |
|---|---|
| Reserva válida con pasajero existente y vuelo disponible | P001 en LA4567 queda `completed` |
| Pasajero inexistente | `rejected` con `PASSENGER_NOT_FOUND` |
| Vuelo sin asientos | UX0045 queda `rejected` con `NO_SEATS_AVAILABLE` |
| Datos malformados | Una reserva mal formada queda `rejected` con `MALFORMED_RESERVATION` y la otra del lote sale bien. Un lote que no es array da 400 |
| Economy sin descuentos | P004 en economy, total verificado a mano |
| Gold con descuento por lealtad | P001, descuento del 15 % |
| Niño en business con descuentos combinados | P005 en business, 2,5 y después 25 % |
| Senior en primera con múltiples ajustes | P006 en first, 4, después 10 % y después 15 % |
| Conversión aplicada | Proveedor simulado, `localPricing` presente |
| Destino con moneda diferente | AR1140 en EUR e IB6844 en ARS |
| API falla | Proveedor que siempre falla, queda `completed_with_warnings` con precios en USD |
| Uso de caché | Dos lotes seguidos, el proveedor se llama una sola vez y el segundo lote tiene `source` igual a `cache` |
| Timeout en API externa | Proveedor que no responde, con timeout configurado en 50 ms, termina en respaldo |
| Filtro que lanza excepción | Filtro de prueba inyectado, queda `error` con `FILTER_EXCEPTION` y las demás reservas no se afectan |
| Pipeline interrumpido por falla de red | `fetch` rechaza con `TypeError`, hay 3 intentos y termina en respaldo |
| Datos corruptos a mitad del pipeline | Filtro de prueba que deja `basePrice` en `NaN`, queda `error` con `CORRUPTED_CONTEXT` |

**Tests de los demás endpoints.** Estado existente e inexistente, GET y PUT de configuración válida e inválida, deshabilitar un filtro y ver el efecto en el siguiente procesamiento, e invalidar la caché.

**Control de independencia.** Un test que lee los archivos de `src/filters` y falla si alguno importa otro filtro o algo de `src/http`.

**Criterio de terminado.** `npm run verify` pasa sin errores y la cobertura de `src/filters`, `src/pipeline` y `src/services` supera el 90 %.

## 9. Colección de Postman

`postman/reservas-pf.postman_collection.json` tiene:

- una variable `baseUrl`;
- una carpeta por grupo de casos de la letra: flujo básico, precios, tipo de cambio y errores;
- una carpeta de configuración, con GET, PUT para deshabilitar un filtro, PUT inválido y restablecer;
- una carpeta de estado y caché;
- un ejemplo de respuesta guardado en cada request.

Los casos de error externo que no se pueden forzar desde Postman se documentan con un PUT de configuración que baja el timeout a 100 ms. También se puede apuntar `EXCHANGE_API_BASE_URL` a una URL inexistente.

## 10. README

El README incluye estas secciones:

1. **Descripción.** Qué hace el sistema.
2. **Arquitectura en breve.** El diagrama del pipeline y enlaces a `docs/`.
3. **Requisitos e instalación.** Node, `npm install` y `cp .env.example .env`.
4. **Ejecución.** Con `dev`, `build` y `start`.
5. **Variables de entorno.**
6. **Endpoints.** Con ejemplos de request y response.
7. **Reglas de cálculo y supuestos.**
8. **Datos mock disponibles.** Tabla de pasajeros y vuelos, y para qué caso sirve cada uno.
9. **Manejo de errores y códigos.**
10. **Tests.** Cómo correrlos y la tabla de casos de la letra.
11. **Postman.** Cómo importar la colección.

## 11. Verificación final

- `npm run verify` pasa.
- `npm run build && npm start` levanta en el puerto 3000 y `GET /health` responde.
- Con la API real, un lote con LA4567 devuelve `source` igual a `api`, y un segundo lote devuelve `cache`.
- Con `EXCHANGE_API_BASE_URL` apuntando a un host inexistente, el lote tarda unos segundos más y devuelve warnings con precios en USD.
- Toda la colección de Postman corre sin errores.
- Los documentos de `docs/` siguen coincidiendo con el código. Si algo cambió durante la implementación, se actualiza la vista o el ADR correspondiente.

## Orden de trabajo y commits sugeridos

1. Estructura del proyecto y base.
2. Datos mock y repositorios.
3. Núcleo del pipeline con sus tests.
4. Filtros de precio con sus tests.
5. Filtros de validación con sus tests.
6. Servicio de tipo de cambio y filtro 3 con sus tests.
7. Procesamiento, contenedor y capa HTTP con los tests de integración.
8. Colección de Postman.
9. README y ajustes finales a `docs/`.

## Decisiones de implementación

Decisiones que se tomaron al implementar y que no estaban en el plan original.

### Paso 1, estructura del proyecto

- **`typecheck` corre sobre `tsconfig.test.json`, no sobre `tsconfig.json`.** Así el chequeo de tipos también cubre `tests/`, que es donde está la mitad del código. `tsconfig.json` queda solo para `build`, con `rootDir: src`.
- **`jest.config.cjs` trae `coverageThreshold` al 90 %** en `src/filters/`, `src/pipeline/` y `src/services/`, que es el criterio de terminado de la sección 8.

### Paso 7, procesamiento y capa HTTP

- **`createContainer` acepta `exchangeRateProvider`, `exchangeRateService` y `extraFilters` por `overrides`.** Reemplazar el proveedor alcanza para probar caché, reintentos, timeout y respaldo sin tocar el servicio ni salir a internet. `extraFilters` es para los filtros de prueba de los casos de excepción y de contexto corrupto, que el ADR-003 pide inyectar por la raíz de composición; van después del orden de la letra porque `createFilterRegistry` solo acepta los siete nombres conocidos.
- **El servicio de tipo de cambio recibe el logger del proyecto**, en lugar de su `console` por defecto, para que quede en silencio cuando `NODE_ENV` es `test`.
- **El estado `processing` lo lleva el servicio de procesamiento, no el almacén de estados.** `ReservationProcessingService` mantiene el conjunto de reservas en curso y expone `isProcessing`. Así un GET de estado concurrente responde `processing` en lugar de 404, sin tener que guardar resultados a medio armar ni ampliar el tipo `ReservationResult`.
- **Una reserva mal formada no entra al pipeline.** Se le arma el `ReservationResult` rechazado directamente, con `trace` vacía, y se la deja en la misma posición del lote en que vino.
- **Los ejemplos guardados en la colección de Postman se generan ejecutando la app** contra un proveedor de tipo de cambio simulado. Así las respuestas son reales y las tasas no cambian cada vez que se regenera la colección.

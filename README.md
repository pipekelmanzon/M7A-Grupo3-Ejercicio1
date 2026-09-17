# Sistema de Reservas de Vuelos

Ejercicio de Aplicación 1 de Arquitectura de Software, Grupo 3 de M7A.

## 1. Descripción

Una API HTTP que procesa lotes de reservas de vuelos aplicando el patrón **Pipes and Filters**. Cada reserva atraviesa una secuencia de siete filtros independientes que validan al pasajero, validan el vuelo, resuelven el tipo de cambio y calculan el precio final. La respuesta trae, por cada reserva, el desglose de precios, los errores, los warnings y la traza de los filtros por los que pasó.

Los filtros se pueden habilitar, deshabilitar y reparametrizar en tiempo de ejecución sin tocar código, y una falla de la API externa de tipo de cambio nunca interrumpe el procesamiento del lote.

## 2. Arquitectura en breve

```text
POST /reservations/process
        │
        ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 1. Validación   2. Validación   3. Tipo de   4. Precio   5. Lealtad  │
  │    de Pasajero     de Vuelo        Cambio       Base                 │
  │                                                                      │
  │ 6. Ajuste por Tipo de Pasajero    7. Impuestos y Tasas               │
  └─────────────────────────────────────────────────────────────────────┘
        │
        ▼
  Resultado: pricing, localPricing, metadata, errors, warnings, trace
```

Lo que viaja entre filtros es un único objeto inmutable, el **contexto de la reserva**. Cada pipe verifica que el contexto siga cumpliendo su esquema antes de pasarlo al filtro siguiente.

La documentación completa está en [`docs/`](docs/README.md):

| Documento | Qué responde |
|---|---|
| [01 Contexto](docs/vistas/01-contexto.md) | Alcance del sistema, actores y sistemas externos |
| [02 Componentes y Conectores](docs/vistas/02-componentes-y-conectores.md) | Cómo fluye una reserva por los filtros |
| [03 Módulos](docs/vistas/03-modulos.md) | Cómo se divide el código y qué depende de qué |
| [04 Comportamiento](docs/vistas/04-comportamiento.md) | Orden de las interacciones y caminos de error |
| [ADR-001](docs/adr/ADR-001-instanciacion-pipes-and-filters.md) | Cómo se instancia Pipes and Filters |
| [ADR-002](docs/adr/ADR-002-resiliencia-api-tipo-de-cambio.md) | Cómo se tolera la falla de la API de tipo de cambio |
| [ADR-003](docs/adr/ADR-003-politica-de-errores-del-pipeline.md) | Qué pasa cuando un filtro rechaza o falla |

## 3. Requisitos e instalación

- Node.js 22.18 o superior.

```bash
npm install
cp .env.example .env
```

## 4. Ejecución

```bash
npm run dev      # desarrollo, con recarga automática
npm run build    # compila a dist/
npm start        # ejecuta dist/index.js
```

El servidor queda escuchando en el puerto 3000 y `GET /health` responde `{"status":"ok"}`.

## 5. Variables de entorno

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `NODE_ENV` | `development` | `development`, `test` o `production`. En `test` el logger queda en silencio |
| `EXCHANGE_API_BASE_URL` | `https://api.exchangerate-api.com/v4` | Base de la API de tipo de cambio |
| `EXCHANGE_API_TIMEOUT_MS` | `5000` | Timeout por intento. Entre 100 y 5000 |
| `EXCHANGE_API_MAX_ATTEMPTS` | `3` | Intentos totales. Entre 1 y 3 |
| `EXCHANGE_CACHE_TTL_SECONDS` | `3600` | Vigencia de la caché de tasas |

El entorno se valida con Zod al arrancar: si algo no cumple, el servidor falla de entrada en vez de quedar andando con valores raros.

## 6. Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `POST` | `/reservations/process` | 200 con el reporte del lote, o 400 si el cuerpo no es un lote |
| `GET` | `/reservations/:id/status` | 200 con el último resultado, o 404 |
| `GET` | `/pipeline/config` | 200 con la configuración y el orden de filtros |
| `PUT` | `/pipeline/config` | 200 con la configuración nueva y `warnings` de dependencias, o 400 con `details` |
| `DELETE` | `/exchange-rates/cache` | 204 |
| `GET` | `/health` | 200 |

### Procesar un lote

```bash
curl -X POST localhost:3000/reservations/process \
  -H 'Content-Type: application/json' \
  -d '{
    "reservations": [
      {
        "reservationId": "R-1001",
        "passengerId": "P001",
        "flightCode": "LA4567",
        "origin": "MVD",
        "destination": "GRU",
        "departureDate": "2026-10-02",
        "seatClass": "business",
        "passengerType": "adult"
      }
    ]
  }'
```

```json
{
  "data": {
    "processingTimeMs": 13.01,
    "summary": { "total": 1, "completed": 1, "completedWithWarnings": 0, "rejected": 0, "error": 0 },
    "results": [
      {
        "reservationId": "R-1001",
        "status": "completed",
        "pricing": {
          "currency": "USD",
          "basePrice": 1550, "loyaltyDiscount": 232.5, "passengerTypeDiscount": 0,
          "subtotal": 1317.5, "taxes": 158.1, "fuelSurcharge": 124, "airportFee": 25, "total": 1624.6
        },
        "metadata": {},
        "errors": [],
        "warnings": [],
        "trace": [
          { "filter": "passenger-validation", "outcome": "ok", "durationMs": 8.24 },
          { "filter": "flight-validation", "outcome": "ok", "durationMs": 1.75 },
          { "filter": "base-price", "outcome": "ok", "durationMs": 0.5 },
          { "filter": "loyalty-discount", "outcome": "ok", "durationMs": 0.23 },
          { "filter": "passenger-type-adjustment", "outcome": "ok", "durationMs": 0.4 },
          { "filter": "taxes", "outcome": "ok", "durationMs": 0.28 }
        ]
      }
    ]
  }
}
```

`departureDate` tiene que coincidir con la fecha del vuelo mock, que se calcula en relación al arranque del proceso. Se la puede consultar procesando el lote o mirando `src/data/mockFlights.ts`.

### Deshabilitar un filtro

```bash
curl localhost:3000/pipeline/config | jq '.data.config' > config.json
# editar config.json: filters["loyalty-discount"].enabled = false
curl -X PUT localhost:3000/pipeline/config -H 'Content-Type: application/json' -d @config.json
```

Si el cambio deja a un filtro habilitado sin quien le provea un dato que necesita, la respuesta lo avisa en `warnings` pero acepta la configuración igual: deshabilitar filtros es justamente lo que pide la letra.

## 7. Reglas de cálculo y supuestos

| Etapa | Regla |
|---|---|
| Precio base | Precio del vuelo por el multiplicador de la clase: economy 1, business 2,5, first 4 |
| Descuento por lealtad | Sobre el precio base: bronze 5 %, silver 10 %, gold 15 %. Sin tier, 0 |
| Ajuste por tipo | En cadena, sobre el precio que dejó la lealtad: child 25 %, senior 15 %, adult 0 % |
| Impuestos | 12 % del subtotal |
| Combustible | 8 % del **precio base**, no del subtotal |
| Tasa de aeropuerto | 25 USD fijos |
| Total | subtotal + impuestos + combustible + tasa de aeropuerto |

Supuestos:

- Los descuentos se aplican **en cadena**, no sobre el precio base cada uno.
- Se redondea **solo al final**, a dos decimales, al armar la respuesta.
- Los precios se calculan en USD y la conversión a moneda local se aplica al total.
- Si el tipo de pasajero declarado no coincide con la edad real (menor de 12 debe ser child, mayor de 65 debe ser senior), la reserva se rechaza.

## 8. Datos mock disponibles

Están en `src/data/` y son fáciles de modificar.

### Pasajeros

| Id | Edad | Tipo | Tier | País | Para qué sirve |
|---|---|---|---|---|---|
| P001 | 35 | adult | gold | UY | Caso válido con el descuento más alto |
| P002 | 29 | adult | silver | AR | Caso válido con tier intermedio |
| P003 | 41 | adult | bronze | BR | Caso válido con tier bajo |
| P004 | 50 | adult | none | US | Caso válido sin descuentos |
| P005 | 8 | child | none | UY | Descuento de niño |
| P006 | 70 | senior | silver | US | Descuentos combinados |
| P007 | 33 | adult | none | UY | Inactivo, rechaza con `PASSENGER_INACTIVE` |
| P008 | 27 | adult | none | AR | Email inválido, rechaza con `INVALID_EMAIL` |
| P009 | 38 | adult | none | BR | Nombre vacío, rechaza con `INVALID_NAME` |
| P010 | 30 | adult | none | UY | Para declararlo child y ver `PASSENGER_TYPE_MISMATCH` |

### Vuelos

| Código | Ruta | Precio | Asientos | Para qué sirve |
|---|---|---|---|---|
| AA001 | JFK → MIA (US) | 300 | 50 | Destino en USD, sin conversión real |
| LA4567 | MVD → GRU (BR) | 620 | 40 | Conversión a BRL |
| AR1140 | EZE → MAD (ES) | 950 | 30 | Conversión a EUR |
| IB6844 | MAD → EZE (AR) | 980 | 35 | Conversión a ARS |
| UX0045 | MVD → MAD (ES) | 900 | 0 | Rechazo por `NO_SEATS_AVAILABLE` |
| CM0201 | PTY → MVD (UY) | 410 | 2 | Pocos asientos |
| AA0999 | JFK → MIA (US) | 300 | 50 | Fecha pasada, rechazo por fecha |
| JL0006 | MVD → NRT (JP) | 1200 | 20 | País fuera de la tabla, warning `CURRENCY_NOT_SUPPORTED` |

Las fechas de salida se calculan en relación al arranque del proceso, salvo AA0999 que siempre queda en el pasado.

## 9. Manejo de errores y códigos

Cada reserva termina en uno de cuatro estados. El detalle y la justificación están en el [ADR-003](docs/adr/ADR-003-politica-de-errores-del-pipeline.md).

| Estado | Cuándo |
|---|---|
| `completed` | Pasó por todos los filtros sin problemas |
| `completed_with_warnings` | Terminó bien pero hubo degradaciones, por ejemplo una tasa de cambio vencida |
| `rejected` | Un filtro de validación la rechazó, o el cuerpo de la reserva estaba mal formado |
| `error` | Un filtro lanzó una excepción, devolvió un contexto inválido, o a un filtro crítico le faltó un dato |

| Código | Filtro | Significado |
|---|---|---|
| `MALFORMED_RESERVATION` | entrada | La reserva no cumple el esquema y no entró al pipeline |
| `PASSENGER_NOT_FOUND` | 1 | No existe el pasajero |
| `PASSENGER_INACTIVE` | 1 | El pasajero está dado de baja |
| `INVALID_EMAIL` | 1 | Email con formato inválido |
| `INVALID_NAME` | 1 | Nombre vacío |
| `PASSENGER_TYPE_MISMATCH` | 1 | El tipo declarado no coincide con la edad |
| `FLIGHT_NOT_FOUND` | 2 | No existe el vuelo |
| `NO_SEATS_AVAILABLE` | 2 | El vuelo no tiene asientos |
| `ROUTE_MISMATCH` | 2 | Origen o destino no coinciden con el vuelo |
| `FLIGHT_DATE_MISMATCH` | 2 | La fecha pedida no es la del vuelo |
| `FLIGHT_DATE_IN_PAST` | 2 | El vuelo ya partió |
| `CURRENCY_NOT_SUPPORTED` | 3 | El país de destino no tiene moneda conocida (warning) |
| `EXCHANGE_RATE_STALE` | 3 | Se usó una tasa vencida (warning) |
| `EXCHANGE_RATE_FALLBACK` | 3 | No se pudo obtener la tasa, los precios quedan en USD (warning) |
| `MISSING_DEPENDENCY` | pipeline | Al filtro le falta un dato. Error si es crítico, warning si no |
| `FILTER_EXCEPTION` | pipeline | Un filtro lanzó una excepción |
| `CORRUPTED_CONTEXT` | pipeline | Un filtro devolvió un contexto que no cumple el esquema |

Códigos HTTP: `POST /reservations/process` responde **200** siempre que el cuerpo tenga forma de lote, aunque todas las reservas hayan sido rechazadas. Responde **400** si el cuerpo no es un lote, y **500** solo ante una falla del propio procesador.

## 10. Tests

```bash
npm test             # tests unitarios y de integración
npm run test:coverage # con reporte de cobertura
npm run typecheck    # solo los tipos
npm run verify       # typecheck + test
```

La cobertura de `src/filters`, `src/pipeline` y `src/services` tiene que superar el 90 %, y el umbral está configurado en `jest.config.cjs`.

Los tests de integración cubren los casos de la letra:

| Caso | Dónde |
|---|---|
| Reserva válida | `tests/integration/reservations.test.ts` |
| Pasajero inexistente | `tests/integration/reservations.test.ts` |
| Vuelo sin asientos | `tests/integration/reservations.test.ts` |
| Datos malformados y lote inválido | `tests/integration/reservations.test.ts` |
| Los cuatro casos de cálculo de precios | `tests/integration/reservations.test.ts` |
| Conversión aplicada y destinos con distinta moneda | `tests/integration/exchange-rate.test.ts` |
| Uso de caché, vencimiento e invalidación | `tests/integration/exchange-rate.test.ts` |
| API que falla, timeout, reintentos y respaldo a USD | `tests/integration/exchange-rate.test.ts` |
| Filtro que lanza excepción | `tests/integration/pipeline-errors.test.ts` |
| Datos corruptos a mitad del pipeline | `tests/integration/pipeline-errors.test.ts` |
| Dependencias faltantes por filtros deshabilitados | `tests/integration/pipeline-errors.test.ts` |
| Estado, configuración y caché | `tests/integration/endpoints.test.ts` |

Los tests de tipo de cambio corren contra el servicio real: lo único simulado es el proveedor HTTP, más el reloj y las esperas entre reintentos, para no depender de internet ni tardar una hora en probar el vencimiento de la caché. Ningún test de la suite toca la red.

Un test aparte (`tests/unit/filters/independence.test.ts`) lee los archivos de `src/filters` y falla si alguno importa a otro filtro o a la capa HTTP. Es lo que garantiza que los filtros sigan siendo independientes.

## 11. Postman

La colección está en [`postman/reservas-pf.postman_collection.json`](postman/reservas-pf.postman_collection.json). Se importa desde Postman con **Import → File**.

Trae una variable `baseUrl` que apunta a `http://localhost:3000`, seis carpetas —flujo básico, precios, tipo de cambio, errores, configuración, y estado y caché—, un ejemplo de respuesta guardado en cada request y assertions para poder correrla entera con el Collection Runner.

Un script de pre-request calcula las fechas de salida de los vuelos mock, porque se generan en relación al arranque del proceso y no se pueden escribir fijas.

Para forzar los casos de falla externa que no se pueden provocar desde Postman, se baja el timeout a 100 ms con un PUT a `/pipeline/config`, o se apunta `EXCHANGE_API_BASE_URL` a un host inexistente.

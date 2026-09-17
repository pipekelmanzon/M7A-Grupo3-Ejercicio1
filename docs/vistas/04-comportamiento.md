# 04. Comportamiento

Las vistas estructurales muestran qué elementos hay y cómo se conectan, pero no en qué orden interactúan. Este documento completa esa parte con notaciones orientadas a trazas: dos diagramas de secuencia y un diagrama de actividad. No pretenden cubrir todos los caminos posibles, sino los que más importan para entender el diseño y los casos de prueba de la letra.

## 1. Representación primaria

### 1.1 Procesamiento de un lote

Traza: el cliente envía dos reservas. La primera es válida y la segunda tiene un pasajero inexistente.

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant H as Capa HTTP
    participant P as Procesador de Reservas
    participant S as Estados
    participant PL as Pipeline
    participant F1 as F1 Pasajero
    participant F2 as F2 Vuelo
    participant F3 as F3 Tipo de Cambio
    participant FX as Servicio de Tipo de Cambio
    participant FP as F4 a F7 Precio
    participant R as Armado del resultado

    C->>H: POST /reservations/process con 2 reservas
    H->>H: valida el lote con Zod
    H->>P: process(lote)
    P->>P: inicia el cronómetro y crea un contexto por reserva
    P->>S: guarda ambas como processing

    par Reserva A
        P->>PL: run(contexto A)
        PL->>F1: run(A)
        F1-->>PL: A con passenger
        PL->>PL: valida el contexto
        PL->>F2: run(A)
        F2-->>PL: A con flight
        PL->>F3: run(A)
        F3->>FX: getRates(USD)
        FX-->>F3: tasas desde la caché
        F3-->>PL: A con metadata.currencyConversion
        PL->>FP: run(A) en cada filtro de precio
        FP-->>PL: A con pricing completo
        PL->>R: build(A)
        R-->>PL: resultado A, completed
        PL-->>P: resultado A
    and Reserva B
        P->>PL: run(contexto B)
        PL->>F1: run(B)
        F1-->>PL: B con error PASSENGER_NOT_FOUND y halted
        PL->>PL: marca F2 a F7 como skipped
        PL->>R: build(B)
        R-->>PL: resultado B, rejected
        PL-->>P: resultado B
    end

    P->>S: guarda los resultados finales
    P->>P: detiene el cronómetro
    P-->>H: reporte con resultados, resumen y processingTimeMs
    H-->>C: 200 OK
```

La respuesta es 200 aunque una reserva haya sido rechazada. El pedido HTTP salió bien, y el rechazo es parte del reporte que pide la letra.

### 1.2 Obtención de tasas de cambio

Traza: la caché está vencida y la API falla dos veces antes de responder. Los caminos alternativos muestran qué pasa si falla las tres veces.

```mermaid
sequenceDiagram
    autonumber
    participant F3 as F3 Tipo de Cambio
    participant FX as Servicio de Tipo de Cambio
    participant K as Caché en memoria
    participant AP as Proveedor ExchangeRate-API
    participant API as ExchangeRate-API
    participant L as Logger

    F3->>FX: getRates(USD)
    FX->>K: get(USD)
    alt la entrada está vigente, con menos de 1 hora
        K-->>FX: tasas
        FX-->>F3: tasas, source cache
    else no hay entrada o está vencida
        K-->>FX: vencida
        FX->>FX: ¿ya hay una llamada en curso para USD?
        Note over FX: si la hay, espera esa misma promesa y no llama de nuevo
        loop hasta 3 intentos, esperando 250 ms y luego 500 ms
            FX->>AP: fetchLatest(USD, timeout 5 s)
            AP->>API: GET /v4/latest/USD
            alt no responde en 5 s o hay error de red
                AP-->>FX: TimeoutError o NetworkError
                FX->>L: warn con número de intento y causa
            else responde 5xx o 429
                AP-->>FX: error reintentable
                FX->>L: warn con número de intento y status
            else responde 200
                API-->>AP: JSON
                AP->>AP: valida con Zod
                AP-->>FX: tasas
            end
        end
        alt algún intento salió bien
            FX->>K: set(USD, tasas, 1 h)
            FX-->>F3: tasas, source api
        else fallaron los 3 y hay una entrada vencida
            FX->>L: error de integración
            FX-->>F3: tasas vencidas, source stale-cache
        else fallaron los 3 y no hay nada guardado
            FX->>L: error de integración
            FX-->>F3: sin tasas, source fallback-usd
        end
    end

    alt source es api o cache
        F3->>F3: convierte el precio base a la moneda de destino
    else source es stale-cache
        F3->>F3: convierte y agrega el warning EXCHANGE_RATE_STALE
    else source es fallback-usd
        F3->>F3: deja rate en 1 y moneda USD, y agrega el warning EXCHANGE_RATE_FALLBACK
    end
```

`getRates` nunca lanza una excepción. Todo camino termina en un resultado, así que una falla de red nunca corta el pipeline, como pide la letra.

Una respuesta con estructura inválida o un 4xx distinto de 429 no se reintenta, porque volver a pedir daría el mismo resultado. En esos casos se pasa directo al respaldo.

### 1.3 Ejecución de un filtro dentro del pipeline

Diagrama de actividad de lo que hace `Pipeline.run` con cada filtro, en orden.

```mermaid
flowchart TD
    start([Siguiente filtro]) --> halted{¿La reserva<br/>está cortada?}
    halted -- sí --> skip1[Traza: skipped] --> next
    halted -- no --> enabled{¿Está<br/>habilitado?}
    enabled -- no --> dis[Traza: disabled] --> next
    enabled -- sí --> deps{¿Están los datos<br/>que requiere?}
    deps -- no --> critdep{¿Es un filtro<br/>crítico?}
    critdep -- sí --> misserr[Error MISSING_DEPENDENCY<br/>estado error, se corta<br/>Traza: skipped] --> next
    critdep -- no --> miss[Warning MISSING_DEPENDENCY<br/>Traza: skipped] --> next
    deps -- sí --> run[Ejecutar el filtro<br/>y medir la duración]
    run --> threw{¿Lanzó una<br/>excepción?}
    threw -- sí --> crit{¿Es un filtro<br/>crítico?}
    crit -- sí --> ferr[Error FILTER_EXCEPTION<br/>estado error, se corta<br/>Traza: error] --> next
    crit -- no --> fwarn[Error FILTER_EXCEPTION<br/>estado error, sigue<br/>Traza: error] --> next
    threw -- no --> valid{¿El contexto nuevo<br/>cumple el esquema?}
    valid -- no --> corrupt[Error CORRUPTED_CONTEXT<br/>se conserva el contexto anterior<br/>estado error, se corta] --> next
    valid -- sí --> rej{¿El filtro<br/>rechazó la reserva?}
    rej -- sí --> r[Estado rejected, se corta<br/>Traza: rejected] --> next
    rej -- no --> ok[Traza: ok] --> next
    next([Pasar al siguiente filtro<br/>o al armado del resultado])
```

Los filtros críticos son los dos de validación y el de precio base. Una excepción ahí corta la reserva, porque seguir no tiene sentido si no se sabe quién viaja, en qué vuelo o cuánto cuesta. En los demás filtros la reserva sigue con el error registrado, para que el reporte muestre todo lo que sí se pudo calcular. El detalle está en el [ADR-003](../adr/ADR-003-politica-de-errores-del-pipeline.md).

## 2. Catálogo de elementos

Los participantes de los diagramas son los componentes descritos en la [vista de componentes y conectores](02-componentes-y-conectores.md#21-componentes). Solo aparecen dos elementos nuevos, que son partes internas de componentes ya descritos:

| Elemento | Parte de | Descripción |
|---|---|---|
| Caché en memoria | Servicio de Tipo de Cambio | Un `Map` con la moneda base como clave. Cada entrada guarda las tasas, la fecha informada por el proveedor y el momento en que vence. Las entradas vencidas no se borran, porque sirven de respaldo |
| Logger | Utilidades | Escribe una línea JSON por evento con nivel, mensaje y datos. En los tests está silenciado |

## 3. Guía de variabilidad

- **Timeout y cantidad de intentos.** Se cambian con `PUT /pipeline/config`, dentro de los topes de la letra.
- **Caché.** `DELETE /exchange-rates/cache` la vacía por completo, así que el siguiente pedido va a la API. Como también se borran las entradas vencidas, después de invalidar el único respaldo posible es USD.
- **Filtros críticos.** Qué filtros son críticos está fijado en el código de cada uno y no se configura.

## 4. Decisiones de arquitectura

### 4.1 Justificación

- **Una sola llamada en curso por moneda base.** Como las reservas del lote corren en paralelo, sin esta regla un lote de 50 reservas con la caché vencida haría 50 llamadas simultáneas y agotaría rápido el límite gratuito.
- **La caché vencida como respaldo.** Una tasa de hace unas horas es más útil que no convertir nada. La letra pide caer a una tasa por defecto y seguir en USD si la API falla. Se interpreta que la tasa por defecto es la última conocida y que, si no hay ninguna, se queda en USD. Ver [ADR-002](../adr/ADR-002-resiliencia-api-tipo-de-cambio.md).

### 4.2 Resultados de análisis

| Caso de la letra | Diagrama que lo cubre |
|---|---|
| Reserva válida, pasajero inexistente, vuelo sin asientos, datos malformados | 1.1 y 1.3 |
| Conversión aplicada, moneda distinta, uso de caché | 1.2, caminos de caché y de api |
| API caída, timeout, falla de red | 1.2, caminos de reintento y respaldo |
| Filtro que lanza excepción, datos corruptos a mitad del pipeline | 1.3 |

### 4.3 Supuestos y restricciones

- **Reintentos.** Hay como máximo 3 intentos en total, no 3 reintentos además del primero, y cada intento tiene su propio timeout de 5 s.

## 5. Vistas relacionadas

- [02 Componentes y Conectores](02-componentes-y-conectores.md).
- [ADR-002](../adr/ADR-002-resiliencia-api-tipo-de-cambio.md) y [ADR-003](../adr/ADR-003-politica-de-errores-del-pipeline.md).

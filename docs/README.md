# Documentación de arquitectura

Sistema de procesamiento de reservas de vuelos, Ejercicio de Aplicación 1 de Arquitectura de Software, Grupo 3 de M7A.

La documentación sigue el modelo Views and Beyond de Clements, Bachmann, Bass y otros. Cada vista usa la misma plantilla: representación primaria, catálogo de elementos, guía de variabilidad, decisiones de arquitectura y vistas relacionadas. Las decisiones más importantes están registradas aparte como ADRs, con la estructura vista en clase. Todos los diagramas están escritos en Mermaid, así que se ven directamente en GitHub y en Obsidian.

## Cómo leer esta documentación

Para alguien que llega nuevo al proyecto, el orden recomendado es el siguiente.

1. [Diagrama de contexto](vistas/01-contexto.md), para ver qué hace el sistema y con quién se relaciona.
2. [Vista de Componentes y Conectores](vistas/02-componentes-y-conectores.md), que es la vista principal porque el patrón Pipes and Filters es un patrón de tiempo de ejecución.
3. [Vista de Módulos](vistas/03-modulos.md), para entender cómo está organizado el código y dónde tocar para cambiar algo.
4. [Comportamiento](vistas/04-comportamiento.md), con los diagramas de secuencia del procesamiento de un lote y de la obtención de tasas de cambio.
5. Los ADRs, para entender por qué el diseño quedó así.

## Índice

| Documento | Tipo | Qué responde |
|---|---|---|
| [01 Contexto](vistas/01-contexto.md) | Más allá de las vistas | Alcance del sistema, actores y sistemas externos |
| [02 Componentes y Conectores](vistas/02-componentes-y-conectores.md) | Vista C&C, estilo Pipes and Filters | Cómo fluye una reserva por los filtros en tiempo de ejecución |
| [03 Módulos](vistas/03-modulos.md) | Vista de módulos, estilos descomposición, usos y generalización | Cómo se divide el código y qué depende de qué |
| [04 Comportamiento](vistas/04-comportamiento.md) | Documentación de comportamiento | Orden de las interacciones y caminos de error |
| [ADR-001](adr/ADR-001-instanciacion-pipes-and-filters.md) | Decisión | Cómo se instancia el patrón Pipes and Filters |
| [ADR-002](adr/ADR-002-resiliencia-api-tipo-de-cambio.md) | Decisión | Cómo se tolera la falla de la API de tipo de cambio |
| [ADR-003](adr/ADR-003-politica-de-errores-del-pipeline.md) | Decisión | Qué pasa con una reserva cuando un filtro la rechaza o falla |

## Requerimientos significativos de arquitectura

La funcionalidad está definida por la letra: siete filtros aplicados en orden, cuatro endpoints y un reporte con errores, warnings y tiempo total. Lo que realmente le da forma a la arquitectura son los atributos de calidad que se listan a continuación, ordenados por prioridad.

| Prioridad | Atributo | Escenario | Tácticas usadas |
|---|---|---|---|
| 1 | Modificabilidad | Se agrega, deshabilita o reparametriza un filtro sin modificar el código de los demás filtros | Interfaz común de filtro, encapsulamiento, configuración en tiempo de ejecución |
| 2 | Disponibilidad | La API de tipo de cambio no responde; el lote se procesa igual, con warnings y precios en USD, en menos de 16 segundos en el peor caso | Timeout, reintento, caché, degradación a USD, registro de errores |
| 3 | Testeabilidad | Cada filtro se prueba por separado sin levantar el servidor ni llamar a internet | Filtros sin estado, inyección de dependencias, datos mock en memoria |
| 4 | Performance | Con la caché vigente, un lote de 100 reservas se procesa sin llamadas externas | Caché de una hora, una sola llamada por moneda base, reservas procesadas en paralelo |
| 5 | Integrabilidad | Cambiar de proveedor de tipo de cambio afecta a un único módulo | Adaptador del proveedor, validación de la respuesta externa con Zod |

Seguridad queda fuera del alcance porque la letra no pide autenticación ni datos sensibles reales.

## Mapeo entre vistas

La tabla relaciona cada componente de tiempo de ejecución con el módulo que lo implementa.

| Componente de la vista C&C | Módulo que lo implementa |
|---|---|
| Fuente de datos | `src/http/controllers/reservation.controller.ts` y `src/schemas/reservation.schema.ts` |
| Pipeline y pipes | `src/pipeline/pipeline.ts` y `src/pipeline/context.schema.ts` |
| Filtro de Validación de Pasajero | `src/filters/passenger-validation.filter.ts` |
| Filtro de Validación de Vuelo | `src/filters/flight-validation.filter.ts` |
| Filtro de Tipo de Cambio | `src/filters/exchange-rate.filter.ts` |
| Filtro de Precio Base | `src/filters/base-price.filter.ts` |
| Filtro de Descuento por Lealtad | `src/filters/loyalty-discount.filter.ts` |
| Filtro de Ajuste por Tipo de Pasajero | `src/filters/passenger-type-adjustment.filter.ts` |
| Filtro de Impuestos y Tasas | `src/filters/taxes.filter.ts` |
| Sumidero de datos | `src/services/reservation-processing.service.ts` y `src/pipeline/result-builder.ts` |
| Servicio de Tipo de Cambio | `src/services/exchange-rate.service.ts` |
| Almacén de configuración | `src/pipeline/pipeline-config.store.ts` |
| Almacén de estados | `src/repositories/processing-status.repository.ts` |
| Datos mock | `src/repositories/passenger.repository.ts` y `src/repositories/flight.repository.ts`, sobre `src/data/mockPassengers.ts` y `src/data/mockFlights.ts` |

## Glosario

| Término | Significado |
|---|---|
| Filtro | Componente que recibe el contexto de una reserva, hace una sola tarea y devuelve el contexto actualizado |
| Pipe | Conector que lleva el contexto de un filtro al siguiente y verifica que siga siendo válido |
| Pipeline | La secuencia completa de filtros habilitados, en el orden fijado por el sistema |
| Contexto de reserva | Objeto que viaja por el pipeline con la solicitud, los datos encontrados, el precio, la metadata, los errores, los warnings y la traza |
| Fuente de datos | Punto donde entran las reservas, en este caso el cuerpo de `POST /reservations/process` |
| Sumidero de datos | Punto donde terminan las reservas procesadas: la respuesta HTTP y el almacén de estados |
| Tier de lealtad | Nivel del pasajero en el programa de fidelidad: Bronze, Silver o Gold |
| Tasa de respaldo | Lo que se usa cuando la API de tipo de cambio falla: la última tasa guardada si existe o, si no, dejar el precio en USD |
| Traza | Lista de los filtros por los que pasó una reserva, con su resultado y su duración |

## Control del documento

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 17/09/2026 | Primera versión, antes de empezar la implementación |

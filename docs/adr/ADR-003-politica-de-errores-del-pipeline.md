# ADR-003. Política de errores del pipeline

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 17/09/2026 |
| Autores | Grupo 3, M7A |
| Atributos afectados | Disponibilidad, testeabilidad, usabilidad de la API |
| Vistas afectadas | Componentes y Conectores, Comportamiento |

## Contexto

La letra pide que el pipeline sea robusto ante fallos individuales de filtros y que la salida tenga un reporte de errores y warnings por reserva. Entre los casos de prueba aparecen:

- un pasajero inexistente;
- un vuelo sin asientos;
- datos malformados;
- un filtro que lanza una excepción;
- datos corruptos a mitad del pipeline.

Hay que definir qué pasa con una reserva en cada situación. También hay que definir qué pasa con las demás reservas del mismo lote y qué código HTTP devuelve el endpoint.

Hay tres tipos de problema bien distintos:

1. **Un rechazo de negocio.** Un filtro de validación decide, a propósito, que la reserva no es válida.
2. **Una excepción inesperada.** Un filtro falla por un error de programación o por datos que no esperaba.
3. **Un contexto corrupto.** Un filtro devuelve algo que no cumple el contrato del pipe.

## Decisión

**Reglas por reserva:**

| Situación | Qué pasa con la reserva | Estado final | Código |
|---|---|---|---|
| Reserva mal formada en el lote | No entra al pipeline | `rejected` | `MALFORMED_RESERVATION` |
| Un filtro de validación la rechaza | Se corta, y los filtros siguientes quedan como `skipped` | `rejected` | El del filtro, por ejemplo `PASSENGER_NOT_FOUND` |
| Excepción en un filtro crítico: validación de pasajero, de vuelo o precio base | Se registra el error y se corta | `error` | `FILTER_EXCEPTION` |
| Excepción en un filtro no crítico: tipo de cambio, lealtad, tipo de pasajero o impuestos | Se registra el error y el pipeline sigue con el contexto anterior a ese filtro | `error` | `FILTER_EXCEPTION` |
| Un filtro devuelve un contexto que no cumple el esquema | Se descarta ese contexto, se conserva el anterior y se corta | `error` | `CORRUPTED_CONTEXT` |
| Excepción inesperada en `pipeline.run` que no viene de un filtro puntual (por ejemplo un bug en el propio pipeline) | El servicio de procesamiento la atrapa por reserva: esa reserva queda en error y las demás del lote siguen sin verse afectadas | `error` | `PIPELINE_EXCEPTION` |
| A un filtro no crítico le falta un dato que requiere porque se deshabilitó el filtro que lo provee | No se ejecuta y la reserva sigue | `completed_with_warnings` | `MISSING_DEPENDENCY` como warning |
| Lo mismo, pero en el filtro de precio base | No se ejecuta y se corta, porque sin precio base no hay precio | `error` | `MISSING_DEPENDENCY` como error |
| Degradación del tipo de cambio | Sigue | `completed_with_warnings` | `EXCHANGE_RATE_STALE` o `EXCHANGE_RATE_FALLBACK` |

**Reglas por lote:**

- **Las reservas no se afectan entre sí.** Un problema en una reserva nunca afecta a las demás.
- **Códigos HTTP.** `POST /reservations/process` responde 200 siempre que el cuerpo tenga la forma de un lote, aunque todas las reservas hayan sido rechazadas. Responde 400 si el cuerpo no es un lote, por ejemplo si falta el array, está vacío o supera las 100 reservas. Responde 500 solo ante una falla del propio procesador, fuera de los filtros.
- **Resumen.** La respuesta incluye un resumen con la cantidad de reservas en cada estado.

**Formato de cada problema.** Cada error o warning tiene `code`, `message` y `filter`, así se sabe en qué etapa ocurrió. Las excepciones inesperadas también se registran en el log con su stack. El stack no se incluye en la respuesta.

## Justificación

- **Por qué cortar ante un rechazo.** No tiene sentido calcular precios para un pasajero que no existe o un vuelo lleno. El resultado sería engañoso y el reporte se llenaría de errores derivados del primero. Además, la letra pone la validación primero justamente para eso.
- **Por qué distinguir filtros críticos.** Sin pasajero, sin vuelo o sin precio base, lo que venga después no tiene significado. En cambio, si falla el descuento por lealtad, los impuestos igual se pueden calcular y el reporte muestra con precisión qué etapa falló. Esto responde al pedido de robustez ante fallos individuales.
- **Por qué el estado error aunque siga.** Un precio al que le faltó una etapa no es confiable. Seguir sirve para diagnosticar, no para cobrar, y el estado lo deja claro.
- **Por qué conservar el contexto anterior ante corrupción.** El reporte queda consistente y no se propagan datos inválidos.
- **Por qué 200 aunque se rechacen reservas.** La operación de procesar el lote salió bien. Los rechazos son el resultado del procesamiento, no un error del pedido, y así el cliente recibe el reporte completo en todos los casos.

## Alternativas

| Alternativa | Motivo del descarte |
|---|---|
| Que las reservas rechazadas sigan por todos los filtros acumulando errores | Da precios sin sentido y reportes con ruido |
| Que cualquier excepción corte la reserva | Es más simple, pero pierde información en filtros donde el resto del cálculo sigue siendo posible, y es menos robusto de lo que pide la letra |
| Que cualquier problema cancele el lote entero | Contradice la robustez que pide la letra y castiga a las reservas válidas |
| Responder 207 Multi-Status o 422 cuando hay rechazos | Complica al cliente sin aportar nada, porque el detalle por reserva ya está en el cuerpo |
| Devolver el stack de la excepción en la respuesta | Expone detalles internos. Queda solo en el log |

## Consecuencias

- **El cliente mira el estado de cada reserva.** No alcanza con el código HTTP para saber si una reserva salió bien.
- **Cada filtro declara si es crítico.** Al agregar un filtro nuevo hay que decidirlo.
- **Pruebas por inyección.** Los casos de excepción y de contexto corrupto se prueban inyectando filtros de prueba en el pipeline, gracias a la raíz de composición descrita en la [vista de módulos](../vistas/03-modulos.md#41-justificación).
- **Traza completa.** La traza de cada reserva muestra el resultado de cada filtro, incluidos los salteados y los deshabilitados, lo que facilita entender el reporte.

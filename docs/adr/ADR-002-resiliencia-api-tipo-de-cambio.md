# ADR-002. Resiliencia ante la API de tipo de cambio

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 17/09/2026 |
| Autores | Grupo 3, M7A |
| Atributos afectados | Disponibilidad, performance, integrabilidad |
| Vistas afectadas | Componentes y Conectores, Módulos, Comportamiento |

## Contexto

El filtro de tipo de cambio depende de una API externa gratuita. Es el único elemento del sistema que puede tardar o fallar por causas ajenas. La letra pide varias cosas para esa integración:

- un timeout de 5 segundos como máximo;
- reintento automático hasta 3 intentos;
- una tasa por defecto si la API falla;
- registrar en el log los errores de integración;
- una caché en memoria de una hora, con invalidación manual.

Además aclara que si la API falla el procesamiento sigue, con warnings y precios en USD. Entre los casos de prueba están el timeout, la falla de red y el uso de la caché.

Hay que elegir entre cuatro proveedores sugeridos, y también decidir qué significa tasa por defecto, porque la letra lo menciona en dos lugares con matices distintos.

## Decisión

**Proveedor.** Se usa ExchangeRate-API, con `GET https://api.exchangerate-api.com/v4/latest/USD`. Se accede por medio de un adaptador que implementa la interfaz `ExchangeRateProvider` y valida la respuesta con Zod.

**Servicio de tipo de cambio.** Envuelve al proveedor y aplica estas tácticas en este orden:

1. **Caché.** Si hay una entrada para USD con menos de una hora, se devuelve sin llamar a la API.
2. **Una sola llamada en curso.** Si ya hay una llamada en curso para esa moneda, los pedidos simultáneos esperan esa misma promesa.
3. **Timeout.** Cada intento tiene un límite de 5 segundos, con `AbortSignal.timeout`.
4. **Reintento.** Hay hasta 3 intentos en total, con espera de 250 ms y 500 ms entre ellos.
   - Se reintenta ante error de red, timeout, 429 y 5xx.
   - No se reintenta ante otros 4xx ni ante una respuesta que no cumpla el esquema.
5. **Registro.** Cada intento fallido se registra como warning, y la falla final como error. Se guardan la causa, el número de intento y la duración.
6. **Respaldo.** Si los tres intentos fallan, se usa la última entrada guardada aunque esté vencida y se marca como `stale-cache`. Si no hay ninguna, se devuelve `fallback-usd` y el filtro deja los precios en USD con tasa 1.
7. **Invalidación manual.** `DELETE /exchange-rates/cache` vacía la caché.

**Nunca lanza excepciones.** `getRates` no lanza excepciones. Siempre devuelve tasas o la indicación de respaldo, y el filtro traduce eso en warnings sobre la reserva.

## Justificación

- **Por qué ExchangeRate-API.**
  - No pide clave, así que no hay secretos que manejar ni configurar para corregir el ejercicio.
  - Tiene el límite gratuito más alto de las cuatro opciones.
  - En una sola respuesta trae las tasas de todas las monedas para USD.
  - Como todos los precios base están en USD, con una llamada por hora alcanza para todo el sistema. Eso da unas 720 llamadas por mes, dentro del límite de 1.500.
- **Por qué separar servicio y proveedor.** Las reglas de resiliencia salen de la letra, no del proveedor. Si se cambia de proveedor, la caché y los reintentos se conservan.
- **Qué reintentar.** Solo se reintentan las fallas que pueden ser pasajeras. Reintentar un 404 o un JSON con otra forma solo agrega espera.
- **Por qué una sola llamada en curso.** Como las reservas se procesan en paralelo, sin esta regla un lote con la caché vencida dispararía una llamada por reserva.
- **Qué significa tasa por defecto.** Una tasa de hace pocas horas es mucho más útil que ninguna. Al mismo tiempo, se cumple la aclaración de la letra de seguir en USD cuando no hay nada mejor. Las dos situaciones quedan marcadas con warnings distintos, así que el cliente sabe qué pasó.
- **Por qué nunca lanzar.** Así el pipeline es robusto por diseño: una falla externa nunca se convierte en un error del filtro.

## Alternativas

| Alternativa | Motivo del descarte |
|---|---|
| Fixer, CurrencyAPI u Open Exchange Rates | Piden clave y tienen límites gratuitos menores. Fixer además usa HTTP sin cifrar en el plan gratuito |
| Fallar la reserva o devolver 502 o 504, como en el proyecto cryptoZJ de la materia | Contradice la letra, que pide seguir procesando con warnings |
| Tabla fija de tasas por defecto escrita en el código | Esas tasas quedan desactualizadas enseguida y pueden dar precios muy equivocados sin que se note. Queda como posible mejora si se quisiera |
| Circuit breaker completo | Evitaría pagar los 15 segundos del peor caso en cada lote mientras la API está caída. Se considera una mejora futura porque la letra no lo pide y agrega estado y configuración |
| Librerías como axios-retry o p-retry | Un reintento con espera se resuelve en pocas líneas y así se evita sumar dependencias |
| Pedir las tasas una vez por reserva, sin caché compartida | Agota el límite gratuito y hace lento cada lote |

## Consecuencias

- **Peor caso.** Sin caché y con la API caída, un lote tarda hasta unos 15,75 segundos más de lo normal. Esto se paga una vez por lote, no por reserva. Mientras la API siga caída, cada lote nuevo vuelve a pagarlo, porque no hay circuit breaker.
- **Tasas vencidas.** Una reserva puede salir convertida con una tasa de varias horas atrás. Queda indicado con el warning `EXCHANGE_RATE_STALE` y con la fecha de las tasas en la metadata.
- **Pruebas.** El proveedor se puede reemplazar por uno simulado, y el timeout se puede bajar por configuración para que los tests de timeout y de reintento corran en milisegundos.
- **Caché local.** La caché vive en el proceso: si hubiera varias instancias, cada una tendría la suya. Para este ejercicio alcanza.
- **Invalidación.** Después de invalidar la caché no queda respaldo vencido, así que una falla en ese momento deja los precios en USD.

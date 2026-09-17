# ADR-001. Instanciación del patrón Pipes and Filters

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 17/09/2026 |
| Autores | Grupo 3, M7A |
| Atributos afectados | Modificabilidad, testeabilidad, performance |
| Vistas afectadas | Componentes y Conectores, Módulos |

## Contexto

La letra pide procesar lotes de reservas de vuelos con el patrón Pipes and Filters, usando Node.js, TypeScript y Express. Hay siete filtros con responsabilidades distintas que se aplican en un orden fijo, y cada uno tiene que ser independiente y poder probarse por separado. Tiene que poder elegirse qué filtros están habilitados. La salida de cada reserva no es solo un precio: también incluye errores, warnings y metadata de la conversión de moneda. Además hay que informar el tiempo total del procesamiento.

El patrón viene impuesto, así que la decisión no es si usarlo sino cómo instanciarlo. En clase se vio que el patrón da bajo acoplamiento, reutilización y posibilidad de procesar en paralelo. También se vio que no es buena opción para sistemas interactivos ni para pasos que tardan mucho. Acá el pipeline se dispara desde un endpoint HTTP que espera la respuesta, y uno de los filtros llama a una API externa, así que esas dos desventajas están presentes y hay que tenerlas en cuenta.

## Decisión

- **Dónde corre.** El pipeline es secuencial y corre dentro del mismo proceso. Los pipes son llamadas asíncronas locales con `await` entre filtros.
- **Qué viaja por los pipes.** Un objeto de contexto por reserva, que se trata como inmutable: cada filtro recibe un contexto y devuelve uno nuevo. Ese contexto lleva la solicitud, los datos que se van encontrando, el desglose del precio, la metadata, los errores, los warnings y la traza.
- **Cómo es un filtro.** Todos implementan la misma interfaz `Filter`, con nombre, datos que requiere, si es crítico y un método `run`. El pipeline recibe los filtros ya armados y no conoce las clases concretas.
- **Qué hace el pipe.** Además de pasar el contexto, verifica con un esquema Zod que siga siendo válido antes de entregarlo al siguiente filtro.
- **Fuente y sumidero.** La fuente es el cuerpo del POST, validado con Zod. El sumidero es un armado del resultado que genera la respuesta y la guarda en un almacén de estados en memoria.
- **Paralelismo.** Las reservas de un lote se procesan en paralelo. Los filtros de una misma reserva corren en secuencia.
- **Orden y configuración.** El orden es el de la letra y no se configura. Sí se configura qué filtros están habilitados y sus parámetros, en tiempo de ejecución.
- **Tipo de cambio.** Se respeta el orden literal: el filtro de tipo de cambio va tercero, guarda la tasa en la metadata y convierte el precio base. Los filtros de precio trabajan en USD, y el total en moneda local se calcula en el sumidero con esa tasa.

## Justificación

- **Por qué en proceso.** No hay ningún requisito de escalar los filtros por separado ni de distribuirlos, así que la versión en proceso es la más simple que cumple la letra. También es la más fácil de probar y la que agrega menos sobrecarga, que era una de las desventajas del patrón vistas en clase.
- **Por qué un contexto.** Permite acumular errores y warnings por reserva, que la letra exige en la salida, sin que los filtros tengan que conocerse.
- **Por qué inmutable.** Si un filtro falla a mitad de camino, el pipeline conserva el contexto anterior, que sigue siendo válido. Eso facilita el caso de prueba de datos corruptos.
- **Por qué validar en el pipe.** El control de integridad queda en un solo lugar y no repetido en cada filtro.
- **Por qué en paralelo.** Las reservas son independientes y el procesamiento no descuenta asientos, así que el paralelismo no genera condiciones de carrera y reduce el tiempo total cuando la caché de tasas está vencida.
- **Por qué el total local en el sumidero.** Mantener los filtros de precio en USD los deja independientes del tipo de cambio. Si se deshabilita el filtro 3, el cálculo de precios no cambia.

## Alternativas

| Alternativa | Motivo del descarte |
|---|---|
| Pipeline asíncrono con colas de mensajes entre filtros, con RabbitMQ o BullMQ | Agrega infraestructura y complejidad operativa que la letra no pide. Además, el endpoint tiene que devolver el resultado y el tiempo total en la misma respuesta |
| Streams de Node.js, un `Transform` por filtro | Encaja con la idea de pipes, pero complica cortar una reserva, medir tiempos por filtro y capturar excepciones por filtro. Para lotes de hasta 100 elementos no aporta nada |
| Filtros como middlewares de Express | Ata la lógica de negocio a HTTP, no permite probar los filtros sin Express y mezcla el pipeline de reservas con el de la petición |
| Filtros que transforman solo el precio, con errores en una estructura aparte | Obliga a los filtros a compartir un segundo canal de datos y rompe la idea de que todo lo que un filtro necesita le llega por el pipe |
| Orden de filtros configurable | Permitiría calcular precios antes de validar. La letra dice que el orden lo define el pipeline |
| Mover el filtro de tipo de cambio al final | Es más simple, pero se aparta del orden que da la letra |

## Consecuencias

- **Agregar un filtro.** Es escribir una clase y registrarla, sin tocar las demás. Esto se alinea con el atributo de modificabilidad.
- **Filtros que dependen de otros.** Deshabilitar un filtro puede dejar sin datos a otro. Por eso cada filtro declara lo que requiere, y el pipeline lo saltea con un warning en lugar de fallar.
- **Costo de validar el contexto.** Validar el contexto en cada pipe tiene un costo de CPU. Se puede apagar por configuración si alguna vez molesta.
- **Tiempo de respuesta.** Al ser síncrono, el tiempo de respuesta queda atado al filtro más lento, que es el de tipo de cambio. Esa desventaja se mitiga con las decisiones del [ADR-002](ADR-002-resiliencia-api-tipo-de-cambio.md).
- **Todo en memoria.** Los estados de procesamiento y la configuración se pierden al reiniciar.
- **Evolución.** Si en el futuro los lotes fueran muy grandes, se podría pasar a procesamiento asíncrono. `POST` devolvería 202 y el estado se consultaría con `GET /reservations/:id/status`, que ya existe. Los filtros no cambiarían.

# Plan: `comments.pin`

Revisé cómo funcionan hoy `comments.resolve` y `comments.unresolve`. Son el modelo más cercano, porque cambian un estado del comentario y lo propagan por WebSocket. No edité nada.

## Decisiones de diseño antes de empezar

1. **Quién puede fijar.** Propongo reutilizar la regla de `resolve`: solo hilos raíz (`parentCommentId === null`), no respuestas. Además, quien fija debe poder editar el documento (`authorize(user, "update", document)`). Si quieres que fije cualquiera que pueda comentar, es una decisión de producto.
2. **Uno o varios fijados por documento.** Con uno solo, fijar otro desfija el anterior. Con varios, solo hace falta una columna. Esta decisión cambia la migración y la lógica del modelo.
3. **Un endpoint o dos.** El código actual separa `resolve` y `unresolve`. Para seguir ese patrón necesitas también `comments.unpin`; si no, el comentario no se puede desfijar. Te lo recomiendo.
4. **Qué pasa al resolver o borrar.** Un comentario resuelto y fijado es ambiguo. Lo más simple es desfijar al resolver. El borrado ya es lógico (paranoid), así que basta con filtrar los borrados.

## Archivos a tocar

**Backend**

| Archivo | Cambio |
|---|---|
| `server/migrations/<timestamp>-add-pinned-to-comments.js` | Nueva migración (créala con `yarn sequelize migration:create`). Añade `pinnedAt` (DATE, null) y `pinnedById` (UUID, FK a `users`, `SET NULL`), siguiendo `resolvedAt` y `resolvedById`. Si hay un único fijado por documento, añade un índice único parcial `("documentId") WHERE "pinnedAt" IS NOT NULL AND "deletedAt" IS NULL`. Crea el índice con `CONCURRENTLY`, como en la migración de `ownerId`. |
| `server/models/Comment.ts` | Columnas `pinnedAt` y `pinnedById`, y la asociación `pinnedBy`. Añade `pinnedBy` al `DefaultScope`. Métodos `pin(user)` y `unpin()` análogos a `resolve()` y `unresolve()`, con `ValidationError` si ya está en ese estado o si es una respuesta. |
| `server/routes/api/comments/schema.ts` | `CommentsPinSchema` y `CommentsUnpinSchema` (con `BaseIdSchema`) y sus tipos `CommentsPinReq` y `CommentsUnpinReq`. |
| `server/routes/api/comments/comments.ts` | Rutas `comments.pin` y `comments.unpin`, copiando `comments.resolve`: `auth()`, `commentingEnabled()`, `validate`, `transaction()`. Bloquea la fila con `lock: UPDATE`, haz `authorize` y guarda con `saveWithCtx`. |
| `server/policies/comment.ts` | Políticas `pin` y `unpin`, con la misma estructura que `resolve` y `unresolve`. |
| `server/presenters/comment.ts` | Añade `pinnedAt`, `pinnedBy` y `pinnedById` a la respuesta. Sin esto el cliente no ve el estado. |
| `server/types.ts` | Si añades eventos propios (`comments.pin`, `comments.unpin`), amplía `CommentEvent`. |
| `server/queues/processors/WebsocketsProcessor.ts` | Añade el caso al `switch` de `comments.create` y `comments.update` (~línea 624). Reutiliza `getDocumentEventChannels`, que ya limita el emit a quienes tienen acceso al documento. |
| `server/routes/api/comments/comments.test.ts` | Tests del endpoint (ver más abajo). |

**Frontend**

| Archivo | Cambio |
|---|---|
| `app/models/Comment.ts` | Campos `pinnedAt`, `pinnedBy`, `pinnedById`, un getter `isPinned` y los métodos `pin()` y `unpin()`. |
| `app/stores/CommentsStore.ts` | Acciones `pin(id)` y `unpin(id)` que llaman a `/comments.pin` y `/comments.unpin`, igual que `resolve`. Añade un computed `pinnedThreadsInDocument`. |
| `app/components/WebsocketProvider.tsx` | Si usas `comments.update`, no hace falta nada: ya llama a `comments.add(event)`. Con eventos propios, añade `socket.on("comments.pin", ...)`. |
| `app/scenes/Document/components/Comments/…` | UI: acción en el menú del hilo y un indicador o sección de fijados. |

## Punto clave: cómo se emite el tiempo real

- **Opción A (más simple):** reutilizar el evento `comments.update`. `saveWithCtx` en el `AfterUpdate` ya lo publica, y el procesador emite `presentComment(comment)`. Los clientes ya lo manejan en `WebsocketProvider` con `comments.add(event)`. Es lo que hace `resolve`. Solo necesitas que el presenter incluya los campos nuevos.
- **Opción B:** eventos dedicados `comments.pin` y `comments.unpin`. Solo compensa si otros procesadores, como notificaciones, webhooks o auditoría, deben distinguirlos.

Recomiendo la A. Antes de decidir, revisa `NotificationsProcessor` y `SearchIndexProcessor`. Los dos escuchan `comments.update` y podrían reaccionar a un cambio de fijado que no es una edición de contenido.

## Cosas a vigilar

- **`silent: true`.** `resolve` guarda con `{ silent: true }`, que evita tocar `updatedAt`. Decide si fijar debe hacer lo mismo.
- **Concurrencia.** Si solo se permite un fijado por documento, desfijar el anterior y fijar el nuevo debe ir en la misma transacción. El índice único parcial te protege de las carreras.
- **Permisos y alcance.** Usa `isTeamModel` como las demás políticas. Comprueba que la autorización sobre el documento cubra borradores y colecciones privadas, porque el procesador de WebSockets ya carga el documento con `withDrafts`.
- **Autenticación con API key.** No aplica restricción especial aquí, porque la regla sobre `AuthenticationType.APP` es solo para credenciales de cuenta.
- **Convenciones del repo.** Usa early returns, JSDoc en todo lo exportado y `interface` en lugar de `type` para formas de objeto. Los textos de UI no se añaden a mano a las traducciones.
- **MCP.** `server/mcp/tools/comments.ts` ya referencia estas operaciones. Decide si quieres exponer `pin` también como herramienta MCP.
- **Documentación de la API.** Comprueba si hay un spec OpenAPI o docs de endpoints que deba actualizarse. Yo no lo revisé.

## Tests

En `comments.test.ts`, siguiendo los de `resolve`:

- Fijar con éxito (200, `pinnedAt` y `pinnedById` presentes).
- Fijar un comentario ya fijado (400).
- Fijar una respuesta (400).
- Usuario sin permiso de edición (403).
- Usuario de otro equipo (403).
- Que `unpin` revierte el estado.
- Si hay un único fijado por documento, que fijar uno nuevo desfija el anterior.
- Que se emite el evento. Los tests de servidor que usan `vi.mock` o `vi.resetModules` deben empezar con `// @vitest-isolate true`.
- Recarga el modelo en los tests para verificar la persistencia, no el estado en memoria.

Ejecútalos con `yarn test server/routes/api/comments/comments.test.ts`, y después `yarn tsc` y `yarn lint`.

## Orden recomendado

1. Migración y modelo.
2. Política, schema y ruta, con tests.
3. Presenter y procesador de WebSockets.
4. Modelo y store del cliente, y después la UI.
5. Verificación end-to-end con la skill `verify-outline`, con dos sesiones para comprobar el tiempo real.

Si me confirmas las decisiones 1 a 4, puedo pasar a implementarlo.

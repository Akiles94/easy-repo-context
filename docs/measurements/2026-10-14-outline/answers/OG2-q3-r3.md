# Plan: `comments.pin`

`comments.resolve` hace casi exactamente lo que necesitas (cambia el estado de un hilo y lo propaga en tiempo real), así que lo usaría como plantilla. No he editado nada.

## Cómo funciona `comments.resolve` hoy
1. El handler bloquea la fila del comentario con `FOR UPDATE`.
2. Llama a un método del modelo (`comment.resolve(user)`) y guarda con `comment.saveWithCtx(ctx, { silent: true })`.
3. Ese guardado emite `comments.update`. `WebsocketsProcessor` lo recoge y lo envía por socket a los canales del documento con `presentComment`.
4. En el cliente, `useCommentHandlers` en `app/components/WebsocketProvider.tsx` hace `comments.add(event)`.

Si `pin` se guarda con `saveWithCtx`, el tiempo real sale casi gratis. No hace falta un evento nuevo.

## Archivos a tocar

**Backend**
| Archivo | Cambio |
|---|---|
| `server/migrations/<timestamp>-add-pinned-to-comments.js` | Añadir `pinnedAt` (DATE, null) y `pinnedById` (UUID, FK a `users`, `SET NULL`). Sigue el patrón de la migración `…add-owner-id-to-collections.js`: transacción, `down` reversible. Si habrá listados por fijados, añade un índice parcial con `CONCURRENTLY`. |
| `server/models/Comment.ts` | Columnas `pinnedAt`/`pinnedById`, relación `pinnedBy`, y métodos `pin(user)` / `unpin()` (sin guardar, como `resolve`). |
| `server/policies/comment.ts` | Habilidades `pin` y `unpin`. |
| `server/routes/api/comments/schema.ts` | `CommentsPinSchema` (y `Unpin`) con `id`, más sus tipos `Req`. |
| `server/routes/api/comments/comments.ts` | Rutas `comments.pin` y `comments.unpin`, copiando el esquema de `comments.resolve`. |
| `server/presenters/comment.ts` | Exponer `pinnedAt`, `pinnedBy`, `pinnedById`. Sin esto el evento de socket no lleva el estado. |
| `server/routes/api/comments/comments.test.ts` | Tests: caso feliz, ya fijado, respuesta (no raíz), permisos, otro equipo. |

**Frontend**
| Archivo | Cambio |
|---|---|
| `app/models/Comment.ts` | Campos `pinnedAt`/`pinnedBy`/`pinnedById`, getter `isPinned`, métodos `pin()`/`unpin()`. |
| `app/stores/CommentsStore.ts` | Acciones `pin`/`unpin` (`client.post("/comments.pin")`) y un computed para los fijados de un documento. |
| `app/components/WebsocketProvider.tsx` | Probablemente nada, porque `comments.update` ya hace `comments.add(event)`. Revisa el `if (comment?.resolvedAt !== event.resolvedAt)` de `comments.update`: es una rama específica de resolver y podría no tocar lo fijado. |
| UI de comentarios (menú del hilo) | Opción de fijar/desfijar y un indicador visual. Falta localizar el componente exacto. |

## Qué tener en cuenta
- **Decide qué significa "fijar".** El diseño depende de esto y conviene confirmarlo antes de codificar:
  - ¿Un solo fijado por documento o varios? Uno solo exige desfijar el anterior en la misma transacción y un índice único parcial por `documentId`.
  - ¿Quién puede fijar? Autor, admin o cualquiera con permiso de edición. Yo usaría `authorize(user, "update", document)`, como `resolve`, además de la habilidad del comentario.
  - ¿Solo hilos raíz? Las respuestas deberían rechazarse, como en `resolve` (`parentCommentId === null`).
- **Concurrencia.** Bloquea la fila con `FOR UPDATE` como hacen los demás handlers. Si el límite es uno por documento, bloquea también la fila del documento para que dos pins simultáneos no violen la regla. Es el mismo tipo de trampa que anota `.context/gotchas.md` para los comentarios anclados.
- **`silent: true`.** Úsalo para que fijar no cambie `updatedAt`, igual que `resolve`. Mantén los hooks activados: no uses `hooks: false`, porque el `AfterUpdate` de los modelos depende de ellos.
- **Efectos secundarios de `comments.update`.** Ese evento también dispara `CommentUpdatedNotificationsTask` y la indexación. Comprueba que fijar no genere notificaciones de "comentario editado" ni menciones nuevas. Si lo hace, haz que el task ignore los cambios que solo tocan `pinnedAt`/`pinnedById`, o emite un evento propio `comments.pin`.
  - La alternativa de un evento propio exige tocar `server/types.ts` (`CommentEvent`) y un `case` en `WebsocketsProcessor`. Es más explícito, pero más código.
- **Interacción con resolver.** Decide si un hilo resuelto puede seguir fijado. Lo más simple es desfijar al resolver o impedir fijar hilos resueltos. Además, el hook `cascadeResolvedToReplies` propaga el estado resuelto, así que no mezcles el pin ahí.
- **Autorización de lectura.** `WebsocketsProcessor.getDocumentEventChannels` ya limita los canales a quienes pueden ver el documento, incluidos los borradores. No emitas por otro camino.
- **Permisos del cliente.** `presentPolicies(user, [comment])` debe devolver `pin`/`unpin` para que la UI muestre u oculte la acción.
- **Reglas del repo.**
  - JSDoc en todo lo exportado.
  - Early returns y llaves siempre.
  - Sin `any`.
  - Si el handler del socket cambia, mantén las props estables.
  - No añadas cadenas de traducción a mano.
  - No crees archivos `.md`.
- **Verificación.** Corre `yarn test server/routes/api/comments/comments.test.ts`, `yarn tsc` y `yarn lint`. Para el tiempo real conviene probarlo con dos sesiones, por ejemplo con la skill `verify-outline`.

## Preguntas antes de implementar
1. ¿Un fijado por documento o varios?
2. ¿Quién puede fijar?
3. ¿Fijar se comporta como "edición silenciosa" (sin notificaciones) o debe notificar?

Con esas tres respuestas puedo concretar el plan hasta el nivel de código.

# Plan: `comments.pin`

Basé el plan en `comments.resolve` y `comments.unresolve`, que ya hacen algo parecido: cambian el estado de un comentario raíz y lo propagan por websocket.

## Archivos a tocar

**Backend**
1. **Migración nueva** (`yarn sequelize migration:create --name=add-pinned-to-comments`). Añade `pinnedAt` (DATE, nullable) y `pinnedById` (UUID, FK a `users`, `ON DELETE SET NULL`). Guarda quién lo fijó y cuándo, como `resolvedAt` y `resolvedById`. Considera un índice parcial sobre `(documentId) WHERE pinnedAt IS NOT NULL` si vas a listar los fijados.
2. **`server/models/Comment.ts`**
   - Columnas `pinnedAt` y `pinnedBy`.
   - Métodos `pin(user)` y `unpin()`, con `ValidationError` como `resolve()`/`unresolve()`. No guardan nada, igual que esos.
   - Un getter `isPinned`.
3. **`server/policies/comment.ts`**: nuevas reglas `pin` y `unpin`. Solo comentarios raíz (`parentCommentId === null`). Debes decidir quién puede fijar (ver abajo).
4. **`server/routes/api/comments/schema.ts`**: `CommentsPinSchema` con `{ id: uuid }`, y el tipo `CommentsPinReq`.
5. **`server/routes/api/comments/comments.ts`**: ruta `comments.pin`, copiando la estructura de `comments.resolve`:
   - Middlewares: `auth()`, `commentingEnabled()`, `validate()` y `transaction()`.
   - Carga el comentario con `lock: UPDATE`.
   - Carga el documento y llama a `authorize(user, "pin", comment)` y `authorize(user, "update", document)`.
   - Llama a `comment.pin(user)` y `saveWithCtx(ctx)`.
   - Responde con `presentComment` y `presentPolicies`.
6. **`server/presenters/comment.ts`**: exponer `pinnedAt` y `pinnedById` (o `pinnedBy`).
7. **Evento y websocket**
   - Lo más simple es reutilizar `comments.update`, que ya emite `WebsocketsProcessor` (líneas ~624-644) a los canales del documento. Entonces no necesitas un evento nuevo.
   - Si quieres un evento propio (`comments.pin`), añade el tipo en `server/types.ts` (junto a `CommentEvent`) y un `case` en `WebsocketsProcessor`. Entonces también hay que revisar `NotificationsProcessor`, `SearchIndexProcessor` y webhooks, que escuchan `comments.update`.
   - Recomiendo reutilizar `comments.update`, porque con un evento nuevo tendrías que mantener más consumidores.
8. **Scopes de API key y OAuth**: revisa dónde se registran los scopes por método (`AuthenticationHelper.canAccess("comments.update", ...)` aparece en `server/mcp/tools/comments.ts`). `comments.pin` debe entrar en el scope de escritura de `comments.*`.
9. **Tests**: en `server/routes/api/comments/comments.test.ts`, un `describe("#comments.pin")`. Cubre autenticación (el snapshot se regenera), permisos, que no se pueda fijar una respuesta, el doble pin, y que `pinnedAt` quede guardado tras recargar el modelo. Añade también tests de `pin()`/`unpin()` en `server/models/Comment.test.ts`.

**Frontend**
10. **`app/models/Comment.ts`**: campos `pinnedAt`/`pinnedById`, un getter `isPinned` y acciones `pin()`/`unpin()`.
11. **`app/stores/CommentsStore.ts`**: métodos `pin(id)` y `unpin(id)` que llaman a `/comments.pin` y `/comments.unpin`, como `resolve`. Un computed `pinnedThreadsInDocument(documentId)` para pintarlos.
12. **`app/components/WebsocketProvider.tsx`** (~línea 639): en el handler de `comments.update`, hay que invalidar la policy también cuando cambia `pinnedAt`. Hoy solo lo hace si cambia `resolvedAt`. Sin eso, el botón de fijar/desfijar mostraría un estado de permisos desactualizado.
13. **UI** en `app/scenes/Document/components/Comments/`: botón o menú "Fijar" en el hilo, ordenar los fijados primero y mostrar un indicador. Las cadenas nuevas con `t()`, sin tocar los archivos de traducción.

## Qué tener en cuenta

- **Necesitas también `comments.unpin`.** Sin él no hay forma de deshacerlo. Si no quieres otro endpoint, haz que `comments.pin` acepte un flag, pero lo habitual en este código es un endpoint por acción.
- **Quién puede fijar.** `resolve` hoy exige `isTeamModel(actor, comment.createdBy)` más `update` sobre el documento. Fijar es una acción de moderación, así que quizá baste con `update` sobre el documento, sin ser el autor. Esa decisión es tuya; define también si hay un límite de fijados por documento.
- **Solo comentarios raíz.** Un hilo se fija entero. No hace falta propagar a las respuestas, a diferencia de `resolved`, que usa `cascadeResolvedToReplies`.
- **¿Fijar y resolver son independientes?** Define qué pasa si se resuelve un hilo fijado. Mi sugerencia es no desfijar automáticamente, pero ocultarlo de la lista de fijados.
- **Tiempo real.**
  - Se emite desde el hook del modelo vía `saveWithCtx(ctx)`. No uses `silent: true` sin comprobar qué hace. `resolve` lo usa, pero antes confirma que el evento `comments.update` se sigue publicando.
  - El payload sale de `presentComment`, así que los campos nuevos deben estar ahí o los demás clientes no los verán.
- **Convenciones del repo** (de `AGENTS.md`).
  - Usa transacciones.
  - Si reemplazas arrays o JSON, no los mutes en el sitio.
  - JSDoc en todo lo exportado.
  - Curly braces siempre.
  - No crees archivos `.md`.
- **Pruebas manuales.** Con la skill `verify-outline` puedes levantar la app y probarlo con dos sesiones de navegador para ver el efecto en tiempo real.

Si me dices quién debe poder fijar y si quieres un evento propio o reutilizar `comments.update`, ajusto el plan y, si quieres, lo implemento.

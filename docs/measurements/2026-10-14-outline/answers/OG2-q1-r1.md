`documents.update` carga el documento, comprueba permisos y delega en `documentUpdater`. Ese comando aplica los cambios, toma un bloqueo de fila y guarda dentro de una transacción. Después, los hooks de Sequelize y los procesadores de eventos producen los efectos secundarios. Leí el código y coincide con `.context/flows/document-update.md`. Añado un par de detalles que la doc no recoge.

## Recorrido

1. **Ruta** (`server/routes/api/documents/documents.ts:1464`)
   - Los middlewares son `auth()`, `validate(DocumentsUpdateSchema)` y `transaction()`. Todo el handler corre dentro de una transacción.
   - Carga el documento con `Document.findByPk(id, { includeState: true, ... })`.
   - Autoriza `update`. Si el body contiene solo `id` y `deprecatedReason`, autoriza `updateDeprecatedReason` y la carga pasa a `paranoid: false`, de modo que también acepta documentos archivados o borrados.
   - Si llega `insightsEnabled`, exige `updateInsights`. Si llega `publish`, llama a `authorizeDocumentPublish`.
   - Lee la cabecera `x-editor-version` y se la pasa al comando.

2. **Aplicar cambios en memoria** (`server/commands/documentUpdater.ts:52`)
   - Asigna `title` (con `trim`), `icon`, `color`, `editorVersion`, `templateId`, `fullWidth`, `insightsEnabled` y `preferences`. Las `preferences` se fusionan con las existentes.
   - Si llega `text`, primero se llama a `TextHelper.replaceImagesWithAttachments(..., { base64Only: true })`, que convierte las imágenes base64 en attachments. Luego `DocumentHelper.applyMarkdownToDocument()` aplica el texto según `editMode` (`replace`, `append`, `prepend` o `patch`, este último con `findText`). Esa función actualiza a la vez `content` y el `state` de Y.js.

3. **Bloqueo de fila y control de concurrencia** (`documentUpdater.ts:116-135`)
   - Hace un `SELECT ... FOR UPDATE` sobre el documento, con `paranoid: false`.
   - Si viene `lastRevision`, se añade al `WHERE` como `revisionCount`. Si no hay fila, lanza `DocumentConflictError`.
   - Sin `lastRevision` no hay detección de conflictos: dos escrituras concurrentes son last-write-wins. Solo se serializan por el bloqueo.

4. **Rama de `deprecatedReason`** (`documentUpdater.ts:137-149`)
   - Recarga el documento bajo el bloqueo y lanza `ValidationError` si sigue activo.
   - Guarda con `silent: true` y devuelve sin pasar por el resto del flujo.

5. **Guardado** (`documentUpdater.ts:151-177`)
   - Si pide `publish` y hay colección, llama a `document.publish(ctx, ...)`.
   - Si no, y hubo cambios, asigna `lastModifiedById` y `updatedBy` y llama a `saveWithCtx`.
   - Si no hubo cambios pero viene `done`, solo agenda el evento con `Event.schedule`.

6. **Respuesta**
   - Si hubo publicación o cambió la colección, recarga con `Document.findByPk(..., { userId })`. Los hooks reemplazan la colección cargada por una sin datos de membresía, y sin esa recarga las policies saldrían inexactas.
   - La ruta responde con `presentDocument` y `presentPolicies`.

## Efectos secundarios

- **Fila en `documents`**: se actualizan `title`, `content`, `state`, `updatedAt` y `lastModifiedById`, entre otros campos.
- **Evento `documents.update`**: lo crea `saveWithCtx`, con `data.done` si se envió. Lo consumen varios procesadores:
  - `RevisionsProcessor` solo actúa si `data.done` es verdadero. Crea una `Revision` a menos que `content` y `title` sean idénticos a la última, y programa `DocumentUpdateTextTask`. Si no se envía `done`, esta llamada no genera revisión.
  - `BacklinksProcessor`, `DebounceProcessor` (genera `documents.update.debounced`) y `WebsocketsProcessor` también escuchan este evento.
  - Hay además un filtro en `server/routes/api/integrations/integrations.ts`, que no he leído.
- **Hook `AfterUpdate` `publishTitleChangeEvent`** (`Document.ts:628`): si cambió `title`, emite `title_change` solo por websocket, sin persistirlo.
- **Hook `AfterUpdate` `notifyCollaborationServer`** (`Document.ts:642`): si cambió `state`, llama a `APIUpdateExtension.notifyUpdate` en el `afterCommit` de la transacción. Así los editores abiertos reciben el cambio solo cuando la transacción se confirma.
- **Attachments**: las imágenes base64 del `text` se suben y se sustituyen por referencias.
- **Publicación**: `document.publish` puede mover el documento de colección y actualizar la estructura de la colección.

## Puntos a vigilar

- Si una escritura cambia `content` pero no `state`, los editores abiertos no se enteran. Por eso el cuerpo debe pasar siempre por `applyMarkdownToDocument`.
- No guardes con `hooks: false`. `silent: true` solo omite el cambio de timestamps y los hooks siguen ejecutándose.
- Para editar el estado colaborativo se usa `documentCollaborativeUpdater`, no este comando.
- `server/mcp/tools/documents.ts:719` llama al mismo `documentUpdater`, así que la herramienta MCP comparte este comportamiento.

No ejecuté tests ni la app, solo leí el código.

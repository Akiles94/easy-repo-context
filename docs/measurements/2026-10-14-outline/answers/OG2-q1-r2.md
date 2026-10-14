`documents.update` carga el documento, comprueba permisos y delega en `documentUpdater`. Ese comando aplica los cambios bajo un bloqueo de fila y guarda dentro de una transacción. Si cambió el contenido, avisa a los editores en vivo después del commit. La doc de `.context/flows/document-update.md` coincide con el código, salvo un matiz que indico al final.

## Recorrido

1. **Ruta** (`server/routes/api/documents/documents.ts:1464`). Pasa por `auth()`, `validate(DocumentsUpdateSchema)` y `transaction()`, así que todo corre en una única transacción.
   - Busca el documento con `Document.findByPk(id, { includeState: true, transaction })`.
   - Si el cuerpo solo trae `id` y `deprecatedReason`, usa el permiso `updateDeprecatedReason`. En ese caso `paranoid` es false, por lo que también funciona con documentos borrados. En el resto de casos exige `update`.
   - Si viene `insightsEnabled`, exige `updateInsights`.
   - Si viene `publish`, llama a `authorizeDocumentPublish`.
   - La cabecera `x-editor-version` se pasa como `editorVersion`.

2. **Aplicar campos** (`server/commands/documentUpdater.ts:78-114`). Mutan en memoria `title` (con `trim`), `icon`, `color`, `editorVersion`, `templateId`, `fullWidth`, `insightsEnabled` y `preferences`. Las preferencias se fusionan con las existentes.
   - Si viene `text`, primero `TextHelper.replaceImagesWithAttachments(..., { base64Only: true })` convierte las imágenes en base64 en adjuntos.
   - Después `DocumentHelper.applyMarkdownToDocument` aplica el texto según `editMode`: `replace`, `append`, `prepend` o `patch` (este último usa `findText`).

3. **Bloqueo y control de conflictos** (`documentUpdater.ts:120-135`). Hace un `SELECT ... FOR UPDATE` sobre la fila, así que las escrituras concurrentes se serializan.
   - Si envías `lastRevision`, se añade al filtro como `revisionCount`. Si el documento cambió desde esa revisión, no se encuentra fila y lanza `DocumentConflictError`.
   - Sin `lastRevision` no hay comprobación y gana la última escritura.

4. **Rama `deprecatedReason`** (líneas 137-149). Recarga el documento bajo el bloqueo y exige que esté archivado o borrado (`ValidationError` si no). Guarda con `saveWithCtx(ctx, { silent: true })`, de modo que no cambia la atribución ni la fecha del archivado, y retorna sin pasar por el resto.

5. **Guardado** (líneas 151-177), con tres posibilidades:
   - Con `publish` y una colección, llama a `document.publish(ctx, ...)`.
   - Si no, y hubo cambios, fija `lastModifiedById` y `updatedBy` y llama a `saveWithCtx`.
   - Si no hubo cambios pero `done` es true, solo programa el evento con `Event.schedule`.

6. **Respuesta**. Si hubo `publish`, o si la colección cargada cambió por los hooks de guardado, recarga el documento con `findByPk`. La razón es mantener correctas las políticas, porque la colección sustituida pierde los datos de membresía. La ruta devuelve `presentDocument` y `presentPolicies`.

## Efectos secundarios

- **Fila `documents`:** se actualizan título, contenido, `state` y metadatos. La fila queda bloqueada hasta el commit.
- **Eventos:** `saveWithCtx` y `publish` registran un evento `documents.update` o `documents.publish`. Los procesadores de eventos y los webhooks lo consumen, y el campo `data.done` indica que terminó una sesión de edición.
- **Cambio de título** (`Document.publishTitleChangeEvent`, hook `AfterUpdate`, `Document.ts:627`): emite `title_change` solo si cambió el título. No se persiste (`persist: false`).
- **Editores en vivo** (`Document.notifyCollaborationServer`, `Document.ts:641`): solo si cambió `state`. Se encola en `afterCommit` de la transacción padre, y llama a `APIUpdateExtension.notifyUpdate`, que actualiza a los editores conectados por Y.js. Si falla la transacción, no se notifica.
- **Adjuntos:** las imágenes base64 del texto se convierten en filas de adjuntos dentro de la misma transacción.
- **Publicación:** `publish` puede asignar `collectionId` y actualizar la estructura de la colección mediante hooks.

## Matiz

Verifiqué el código directamente. Lo que no abrí fue `applyMarkdownToDocument` ni `Document.publish`, así que no confirmé ahí en qué punto exacto se regenera `state`. La conclusión de que la notificación solo ocurre cuando `state` cambia sí está comprobada en el hook.

Si quieres, sigo con alguna de esas dos piezas o con la comparación frente a la edición colaborativa (`documentCollaborativeUpdater`).

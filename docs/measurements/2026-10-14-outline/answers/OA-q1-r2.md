`documents.update` es un único POST que cambia la fila del documento dentro de una transacción. Todo lo demás (websockets, revisiones, índice de búsqueda, backlinks) ocurre después del commit, de forma asíncrona, a partir de un evento.

## 1. Ruta: `server/routes/api/documents/documents.ts:1464`

La cadena de middlewares es `auth()` → `validate(DocumentsUpdateSchema)` → `transaction()` → handler.

- **Validación** (`schema.ts:392`). Acepta `title`, `text`, `icon`, `color`, `fullWidth`, `preferences`, `insightsEnabled`, `publish`, `collectionId`, `templateId`, `lastRevision`, `editMode`, `findText`, `done` y `deprecatedReason`.
  - `editMode` puede ser replace, append, prepend o patch.
  - Append y prepend exigen `text`.
- **Transacción.** Todo el handler corre dentro de ella, y si algo lanza una excepción se hace rollback.
- **Carga y autorización.**
  - Carga el documento con `Document.findByPk(id, { userId, includeState: true })`.
  - Autoriza `update`, o `updateDeprecatedReason` si el body solo trae `id` y `deprecatedReason`. En ese caso carga con `paranoid: false`, para poder anotar documentos archivados o borrados.
  - Si cambias `insightsEnabled` exige además `updateInsights`.
  - Si `publish` es verdadero llama a `authorizeDocumentPublish`.
- **Delegación.** Llama a `documentUpdater(ctx, {...})`. Con el resultado responde `presentDocument` y `presentPolicies`.
- **Cabecera `x-editor-version`.** Se guarda como `document.editorVersion`.

## 2. Comando: `server/commands/documentUpdater.ts`

El comando no escribe nada hasta el paso 6.

1. **Campos simples.** Asigna `title` (con `trim`), `icon`, `color`, `editorVersion`, `templateId`, `fullWidth` y `insightsEnabled`. `preferences` se mezcla con las existentes.
2. **Texto.** Si viene `text`:
   - `TextHelper.replaceImagesWithAttachments` convierte las imágenes base64 en attachments.
   - `DocumentHelper.applyMarkdownToDocument` (`DocumentHelper.tsx:702`) reconstruye `content` (JSON de ProseMirror) y `text` según el modo. En patch busca `findText` en el markdown serializado, mapea el rango a bloques y hace un parche quirúrgico o reparsea los bloques afectados. En append y prepend fusiona párrafos contiguos.
   - Si el documento tiene `state` (el Y.js de la edición colaborativa), aplica el nuevo contenido al `ydoc` con `updateYFragment`, re-serializa el estado y marca `state` como cambiado.
3. **Bloqueo y concurrencia.** Toma un `SELECT ... FOR UPDATE` sobre la fila. Si pasaste `lastRevision`, este se añade al `WHERE` como `revisionCount`. Si no hay fila, lanza `DocumentConflictError`, que es un control de concurrencia optimista.
4. **Rama `deprecatedReason`.** Recarga bajo el bloqueo y exige que el documento esté archivado o borrado. Guarda con `silent: true`, que no toca `updatedAt`, y retorna sin pasar por los pasos siguientes.
5. **Elección de guardado.**
   - Si `publish` y hay colección, ejecuta `document.publish(...)`.
   - Si solo hay cambios, fija `lastModifiedById` y `updatedBy` y ejecuta `saveWithCtx(ctx, undefined, { data: { done } })`.
   - Si no hay cambios pero `done` es verdadero, emite el evento con `Event.schedule` sin escribir en la base de datos.
6. **Recarga.** Si hubo publicación, o el hook cambió `document.collection`, recarga con `findByPk` para que las políticas reflejen la membresía actual.

## 3. Publicar: `Document.ts:1267`

Si el documento ya estaba publicado, `publish` actúa como un guardado normal. Si no:

- Bloquea la colección (`NO_KEY_UPDATE`).
- Añade el documento al `documentStructure`.
- Copia las membresías de usuario y de grupo del padre.
- Fija `publishedAt`.
- Guarda con el evento `publish`.

El evento resultante es `documents.publish`, no `documents.update`.

## 4. Hooks de Sequelize al guardar

`saveWithCtx` (`Model.ts:69`) pasa el contexto de la petición como opciones de `save`, con `event.publish = true`. Eso activa estos hooks:

- **`@BeforeSave updateCollectionStructure`** (`Document.ts:500`). Si el documento está publicado y cambió `title`, `icon` o `color`, bloquea la colección y actualiza el nodo en `documentStructure`.
- **`@BeforeUpdate processUpdate`** (`Document.ts:568`):
  - Añade el título anterior a `previousTitles`.
  - Añade el último editor a `collaboratorIds`.
  - Rellena `content` si falta.
  - Incrementa `revisionCount`. Este es el valor que compara `lastRevision`.
- **`@BeforeUpdate checkParentDocument`.** Detecta ciclos si cambia el padre.
- **`@AfterUpdate afterUpdateEvent`** (`Model.ts:261`). Inserta una fila en `events` con nombre `documents.update`, o `documents.publish` si venía de publicar. Incluye los `changes` (el changeset previo), `actorId`, `ip`, `authType` y `data` (`{ done }`).
- **`@AfterUpdate publishTitleChangeEvent`.** Si cambió el título, emite `documents.title_change`. Este evento no se persiste y se encola tras el commit.
- **`@AfterUpdate notifyCollaborationServer`** (`Document.ts:641`). Si cambió `state`, tras el commit llama a `APIUpdateExtension.notifyUpdate`. Así el servidor colaborativo difunde el cambio a los editores abiertos y actualiza el Y.js en memoria.

## 5. Del evento a la cola

`Event` (`Event.ts:85`) registra en `afterCommit` de la transacción un `globalEventQueue().add(event)`. Por eso nada se procesa si hay rollback. Cada `Processor` declara `applicableEvents`, y para este flujo los relevantes son:

| Processor | Reacción |
|---|---|
| `WebsocketsProcessor` (`documents.update`) | Emite por socket.io a los canales del documento, así los clientes reciben el cambio en tiempo real. |
| `DebounceProcessor` | `documents.update` reencola `documents.update.delayed` con 5 min de retraso (30 s en desarrollo). Al ejecutarse, si `updatedAt` es posterior al evento, aborta, lo que funciona como un debounce distribuido. Si no, emite `documents.update.debounced`. |
| `RevisionsProcessor` | Con `update.debounced` (o con `update` si `done` es verdadero) crea una `Revision` salvo que el contenido y el título sean idénticos a la última. Programa `DocumentUpdateTextTask` y consume la atribución de colaboradores guardada en Redis. |
| `SearchIndexProcessor` | Reindexa el documento con `update.delayed`. |
| `BacklinksProcessor` | Recalcula los enlaces entre documentos. |
| `NotificationsProcessor` | Solo actúa con `documents.publish`. Notifica la publicación, salvo en importaciones. Las notificaciones de cambios salen de `revisions.create`. |

Además hay webhooks e integraciones suscritos a `documents.update` y `documents.publish`, como los de `integrations.ts`.

## Puntos a tener en cuenta

- **Dos escritores del mismo documento.** Esta ruta cubre las propiedades y el texto vía API. La edición colaborativa usa `documentCollaborativeUpdater`, que emite también `documents.update` pero con otra ruta de escritura. Si el documento tiene `state`, la API lo reescribe y avisa al servidor colaborativo para evitar divergencias.
- **El resultado de la API no incluye las revisiones.** Una llamada que solo cambia el texto no crea revisión inmediata. Se crea al terminar el debounce, o antes si envías `done: true`.
- **No he ejecutado nada.** Esto sale de leer el código; no he corrido tests ni la aplicación.

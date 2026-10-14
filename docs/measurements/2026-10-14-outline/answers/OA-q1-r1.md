`documents.update` hace tres cosas en orden. Valida y autoriza la petición, aplica los cambios al modelo dentro de una transacción y guarda. El guardado inserta un `Event`, y de ese evento salen casi todos los efectos secundarios, que ocurren de forma asíncrona. No ejecuté nada; esto sale solo de leer el código.

## 1. Ruta y validación (`server/routes/api/documents/documents.ts:1464`)

La cadena de middlewares es `auth()`, `validate(DocumentsUpdateSchema)` y `transaction()`. Todo el handler corre en una transacción.

- **Esquema** (`schema.ts:392`): acepta `title`, `text`, `icon`, `color`, `fullWidth`, `preferences`, `insightsEnabled`, `publish`, `collectionId`, `templateId`, `lastRevision`, `editMode`, `findText`, `done` y `deprecatedReason`.
- **Reglas del esquema**: `append` es un campo obsoleto y se convierte en `editMode: "append"`. `append` y `prepend` exigen `text`, y `patch` exige `text` y `findText`.
- **Handler**: carga el documento con `Document.findByPk(id, { userId, includeState: true, transaction })`. Incluye el estado Y.js porque lo necesita más adelante. Es una actualización de `deprecatedReason` cuando ese es el único campo además del `id`. En ese caso se carga con `paranoid: false`, así que puede tocar documentos archivados o borrados.
- **Autorización**:
  - `authorize(user, "update", document)`, o `"updateDeprecatedReason"` en el caso anterior.
  - `updateInsights` si se envía `insightsEnabled`.
  - `authorizeDocumentPublish` si `publish` es verdadero (`commands/documentCreator.ts:118`).
- **Cabecera**: `x-editor-version` se pasa al comando para guardarla en el documento.

## 2. Comando `documentUpdater` (`server/commands/documentUpdater.ts`)

1. **Campos simples**: asigna en memoria `title` (con `trim`), `icon`, `color`, `editorVersion`, `templateId`, `fullWidth`, `insightsEnabled`. `preferences` se fusiona con las existentes, no las reemplaza.
2. **Texto**: si viene `text`, primero hace `TextHelper.replaceImagesWithAttachments` con `base64Only`. Las imágenes en base64 pasan a ser adjuntos subidos al almacenamiento. Después llama a `DocumentHelper.applyMarkdownToDocument`:
   - Los modos `replace`, `append`, `prepend` y `patch` se resuelven sobre el árbol ProseMirror. En `patch` busca `findText` en el markdown y falla con `ValidationError` si no lo encuentra. Intenta un parche quirúrgico y, si no puede, reparsea los bloques afectados.
   - Reescribe `document.content` (JSON) y `document.text` (markdown).
   - Si el documento tiene `state` (Y.js), aplica el nuevo contenido sobre ese estado con `updateYFragment` y lo marca como cambiado. Así la edición colaborativa no se desincroniza.
3. **Bloqueo y concurrencia**: toma un `SELECT … FOR UPDATE` sobre la fila. Si viene `lastRevision`, se añade `revisionCount = lastRevision` al `WHERE`. Si nadie coincide, lanza `DocumentConflictError`. Es un control optimista de versión.
4. **Rama `deprecatedReason`**: recarga el documento bajo el bloqueo y exige que esté archivado o borrado. Guarda el motivo con `saveWithCtx(ctx, { silent: true })`, sin tocar `updatedAt`, y termina ahí.
5. **Guardado**:
   - Si `publish` es verdadero y hay colección, llama a `document.publish(ctx, …)`.
   - Si no, pero hubo cambios, fija `lastModifiedById` y `updatedBy` y llama a `saveWithCtx`.
   - Si no hubo cambios pero `done` es verdadero, programa el evento a mano con `Event.schedule`.
6. **Recarga final**: si hubo publicación o cambió la colección cargada, vuelve a hacer `findByPk` para que las políticas salgan con los datos de membresía correctos.

## 3. Publicar (`Document.publish`, `models/Document.ts:1267`)

- Si el documento ya estaba publicado, se comporta como un guardado normal, pero con el evento `publish`.
- Si era borrador:
  - Añade el documento a `documentStructure` de la colección, con bloqueo `NO_KEY_UPDATE`.
  - Copia las membresías de usuario y de grupo del documento padre, si lo hay.
  - Fija `publishedAt` y guarda con el evento `documents.publish`.

## 4. Hooks de Sequelize al guardar

- **`updateCollectionStructure`** (`@BeforeSave`): si el documento está publicado y cambió `title`, `icon` o `color`, actualiza el árbol de la colección.
- **`processUpdate`** (`@BeforeUpdate`):
  - Guarda el título anterior en `previousTitles`.
  - Añade a `lastModifiedById` como colaborador.
  - Rellena `content` si falta.
  - Incrementa `revisionCount`.
- **`checkParentDocument`**: evita ciclos de anidación.
- **`publishTitleChangeEvent`** (`@AfterUpdate`): si cambió el título, publica un evento `title_change` solo en tiempo real, sin persistirlo.
- **`notifyCollaborationServer`** (`@AfterUpdate`): si cambió `state`, avisa al servidor de colaboración con `APIUpdateExtension.notifyUpdate` tras el commit. Así los editores conectados reciben el cambio hecho por la API.
- **`Model.insertEvent`** (`models/base/Model.ts`, hook de actualización): crea la fila `Event` `documents.update`, o `documents.publish` si se publicó, dentro de la misma transacción.

## 5. Procesadores de eventos (asíncronos, tras el commit)

| Procesador | Reacciona a | Efecto |
|---|---|---|
| `WebsocketsProcessor` | `documents.update` | Emite el documento presentado a los canales de socket.io que corresponden. |
| `DebounceProcessor` | `documents.update` | Reencola `documents.update.delayed` con 5 min de retraso (30 s fuera de producción). Si el documento no cambió desde entonces, emite `documents.update.debounced`. |
| `RevisionsProcessor` | `documents.publish`, `documents.update.debounced`, `documents.update` solo con `done: true` | Crea un `Revision` salvo que el contenido y el título sean idénticos a la última. Atribuye colaboradores desde Redis y programa `DocumentUpdateTextTask`. |
| `BacklinksProcessor` | `documents.publish`, `documents.update` | Crea o actualiza `Relationship` de tipo backlink según los enlaces del documento. En `update` solo lo hace si el documento está publicado. |
| `SearchIndexProcessor` | `documents.publish`, `documents.update.delayed` | Reindexa el documento. No lo leí en detalle. |
| `NotificationsProcessor` | `documents.publish` | Genera notificaciones, con excepciones por ejemplo para importaciones. |

Esto implica que las revisiones y la indexación de búsqueda tardan unos minutos tras una edición, o ocurren de inmediato si el cliente envía `done: true` o si se publica.

## 6. Respuesta

La respuesta es `{ data: presentDocument(...), policies: presentPolicies(...) }`.

Los errores más probables son estos:
- Un 403 por política.
- Un 409 por conflicto de `lastRevision`.
- Un 400 por `patch` sin coincidencia o por `deprecatedReason` en un documento activo.

Si quieres, sigo con `SearchIndexProcessor` o con `DocumentUpdateTextTask`, que no abrí.

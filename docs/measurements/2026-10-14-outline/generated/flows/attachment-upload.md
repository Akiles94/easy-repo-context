# Flow: attachment-upload
Summary: attachments.create → presigned POST/PUT → browser uploads → (local storage) files.create → attachment row settles
Trigger: `server/routes/api/attachments/attachments.ts` (RPC `attachments.create`), called by `app/utils/files.ts:uploadFile()`
Path:
1. `app/utils/files.ts:uploadFile()` — posts `attachments.create` with declared `size` and `contentType`, then uploads via XHR using the returned `mode`.
2. `server/routes/api/attachments/attachments.ts` — authorizes against the document (`update`) or the team (`createAttachment`, plus preset-specific checks); size capped by `AttachmentHelper.presetToMaxUploadSize()`.
3. `server/routes/api/attachments/attachments.ts` — `Attachment.createWithCtx()` stores the declared `size`; key from `AttachmentHelper.getKey()`.
4. `server/storage/files/S3Storage.ts:S3Storage.getPresignedPost()` or `getPresignedPut()` (chosen by `AWS_S3_UPLOAD_METHOD`); `server/storage/files/LocalStorage.ts` signs a JWT with type `attachment-upload` and uploads to `/api/files.create`.
5. `plugins/storage/server/api/files.ts` — `files.create` calls `verifyUploadSignature()` for signed uploads, rejects files larger than the declared size, then `attachment.writeFile()`.
Side effects: attachments row; object in S3 or local disk; `attachment.size` updated silently when the real size differs.
Gotchas: see `.context/gotchas.md` under `server/storage/files`.
Related: `docs/ARCHITECTURE.md`

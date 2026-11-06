/**
 * FileStorageService
 *
 * Single source of truth for all certificate-PDF file operations.
 * No other module should import `fs` or `path` for certificate storage.
 *
 * Responsibilities:
 *  - Define and own UPLOADS_DIR (one place, never duplicated)
 *  - Validate PDF magic bytes on upload
 *  - Provide path-traversal-safe file resolution
 *  - Stream files for download
 *  - Delete files with best-effort semantics
 *  - Produce a configured multer middleware instance
 *
 * Finding 31: Certificate DB/file lifecycle needs explicit error handling.
 * Finding 35: Path traversal guard must live in one authoritative place.
 */
import { ReadStream } from 'fs';
import multer from 'multer';
/** Absolute path to the certificate uploads directory. */
export declare const CERT_UPLOADS_DIR: string;
declare class FileStorageService {
    /**
     * Ensures the uploads directory exists.
     * Called once at application startup (and lazily inside multer destination).
     */
    ensureUploadsDir(): void;
    /**
     * Resolves a bare filename to an absolute path inside CERT_UPLOADS_DIR.
     * Rejects any input that would escape the directory (path-traversal guard).
     *
     * @throws {ValidationError} if the resolved path escapes CERT_UPLOADS_DIR.
     */
    resolveAndVerify(filename: string): string;
    /**
     * Validates that a file on disk begins with the PDF magic bytes (%PDF-).
     * Deletes the temp file if validation fails to avoid leaving orphans.
     *
     * @param tempPath - Absolute path to the file to inspect.
     * @throws {ValidationError} if the file is not a valid PDF.
     * @throws {StorageError} if the file cannot be read.
     */
    validatePdfMagicBytes(tempPath: string): void;
    /**
     * Opens a ReadStream for a stored certificate file.
     * Performs a path-traversal check before opening.
     *
     * @param filename - Bare filename (no directory prefix).
     * @throws {NotFoundError} if the file does not exist on disk.
     */
    stream(filename: string): ReadStream;
    /**
     * Deletes a stored certificate file.
     * Swallows ENOENT (already gone) to be idempotent.
     * Emits a warning for other errors rather than throwing, because file cleanup
     * should not roll back an already-committed DB transaction.
     *
     * @param filename - Bare filename (no directory prefix). May be null/undefined.
     */
    delete(filename: string | null | undefined): void;
    /**
     * Creates a configured multer middleware for certificate PDF uploads.
     * The upload directory is derived from CERT_UPLOADS_DIR — single source of truth.
     */
    createMulterUpload(): multer.Multer;
    /** Private best-effort unlink — never throws. */
    private _safeUnlink;
}
export declare const fileStorageService: FileStorageService;
export {};
//# sourceMappingURL=file-storage.service.d.ts.map
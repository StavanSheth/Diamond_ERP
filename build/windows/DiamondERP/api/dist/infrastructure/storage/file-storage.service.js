"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileStorageService = exports.CERT_UPLOADS_DIR = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const errors_1 = require("../../errors");
const paths_1 = require("../paths");
/** Absolute path to the certificate uploads directory. */
exports.CERT_UPLOADS_DIR = (0, paths_1.getUploadsDir)();
/** Maximum permitted PDF upload size (10 MB). */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** PDF magic-byte signature. */
const PDF_MAGIC = '%PDF-';
class FileStorageService {
    /**
     * Ensures the uploads directory exists.
     * Called once at application startup (and lazily inside multer destination).
     */
    ensureUploadsDir() {
        if (!fs_1.default.existsSync(exports.CERT_UPLOADS_DIR)) {
            fs_1.default.mkdirSync(exports.CERT_UPLOADS_DIR, { recursive: true });
        }
    }
    /**
     * Resolves a bare filename to an absolute path inside CERT_UPLOADS_DIR.
     * Rejects any input that would escape the directory (path-traversal guard).
     *
     * @throws {ValidationError} if the resolved path escapes CERT_UPLOADS_DIR.
     */
    resolveAndVerify(filename) {
        const safeBasename = path_1.default.basename(filename);
        const resolved = path_1.default.resolve(exports.CERT_UPLOADS_DIR, safeBasename);
        if (!resolved.startsWith(exports.CERT_UPLOADS_DIR + path_1.default.sep) &&
            resolved !== exports.CERT_UPLOADS_DIR) {
            throw new errors_1.ValidationError('Invalid file path: potential path traversal detected');
        }
        return resolved;
    }
    /**
     * Validates that a file on disk begins with the PDF magic bytes (%PDF-).
     * Deletes the temp file if validation fails to avoid leaving orphans.
     *
     * @param tempPath - Absolute path to the file to inspect.
     * @throws {ValidationError} if the file is not a valid PDF.
     * @throws {StorageError} if the file cannot be read.
     */
    validatePdfMagicBytes(tempPath) {
        const buffer = Buffer.alloc(5);
        let fd = null;
        try {
            fd = fs_1.default.openSync(tempPath, 'r');
            fs_1.default.readSync(fd, buffer, 0, 5, 0);
        }
        catch (err) {
            this._safeUnlink(tempPath);
            throw new errors_1.StorageError('Could not read uploaded file for validation', err);
        }
        finally {
            if (fd !== null) {
                try {
                    fs_1.default.closeSync(fd);
                }
                catch { /* ignore close error */ }
            }
        }
        if (buffer.toString('utf8') !== PDF_MAGIC) {
            this._safeUnlink(tempPath);
            throw new errors_1.ValidationError('Invalid file format. File is not a valid PDF document.');
        }
    }
    /**
     * Opens a ReadStream for a stored certificate file.
     * Performs a path-traversal check before opening.
     *
     * @param filename - Bare filename (no directory prefix).
     * @throws {NotFoundError} if the file does not exist on disk.
     */
    stream(filename) {
        const filePath = this.resolveAndVerify(filename);
        if (!fs_1.default.existsSync(filePath)) {
            throw new errors_1.NotFoundError('Certificate file not found in storage');
        }
        return fs_1.default.createReadStream(filePath);
    }
    /**
     * Deletes a stored certificate file.
     * Swallows ENOENT (already gone) to be idempotent.
     * Emits a warning for other errors rather than throwing, because file cleanup
     * should not roll back an already-committed DB transaction.
     *
     * @param filename - Bare filename (no directory prefix). May be null/undefined.
     */
    delete(filename) {
        if (!filename)
            return;
        let filePath;
        try {
            filePath = this.resolveAndVerify(filename);
        }
        catch {
            // Invalid path — nothing to delete
            return;
        }
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch (err) {
            const nodeErr = err;
            if (nodeErr.code === 'ENOENT')
                return; // already deleted — idempotent
            console.warn(`[FileStorageService] Failed to delete file "${filePath}":`, nodeErr);
        }
    }
    /**
     * Creates a configured multer middleware for certificate PDF uploads.
     * The upload directory is derived from CERT_UPLOADS_DIR — single source of truth.
     */
    createMulterUpload() {
        const storage = multer_1.default.diskStorage({
            destination: (_req, _file, cb) => {
                this.ensureUploadsDir();
                cb(null, exports.CERT_UPLOADS_DIR);
            },
            filename: (_req, _file, cb) => {
                // 32-char hex name with forced .pdf extension — never derived from user input
                const randomName = crypto_1.default.randomBytes(16).toString('hex');
                cb(null, `${randomName}.pdf`);
            },
        });
        const fileFilter = (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            if (ext === '.pdf' && file.mimetype === 'application/pdf') {
                cb(null, true);
            }
            else {
                cb(new Error('Only PDF files are allowed for certificate uploads. ' +
                    'Both file extension and MIME type must be PDF.'));
            }
        };
        return (0, multer_1.default)({
            storage,
            limits: { fileSize: MAX_PDF_BYTES },
            fileFilter,
        });
    }
    /** Private best-effort unlink — never throws. */
    _safeUnlink(filePath) {
        try {
            if (fs_1.default.existsSync(filePath))
                fs_1.default.unlinkSync(filePath);
        }
        catch { /* ignore */ }
    }
}
exports.fileStorageService = new FileStorageService();
//# sourceMappingURL=file-storage.service.js.map
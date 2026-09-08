import { Request, Response, NextFunction } from 'express';

/**
 * Validation error structure.
 */
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Extended Request type with requestId.
 */
interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Validate a required string field.
 */
function validateRequiredString(
  value: unknown,
  fieldName: string,
  errors: ValidationError[],
): void {
  if (value === undefined || value === null || value === '' || typeof value !== 'string') {
    errors.push({ field: fieldName, message: `${fieldName} is required and must be a non-empty string.` });
  }
}

/**
 * Validate a number field: must be present, a finite number, and non-negative.
 */
function validateNumberField(
  value: unknown,
  fieldName: string,
  errors: ValidationError[],
): void {
  if (value === undefined || value === null || value === '') {
    errors.push({ field: fieldName, message: `${fieldName} is required.` });
    return;
  }

  const num = Number(value);

  if (isNaN(num)) {
    errors.push({ field: fieldName, message: `${fieldName} must be a valid number.` });
    return;
  }

  if (!isFinite(num)) {
    errors.push({ field: fieldName, message: `${fieldName} must be a finite number.` });
    return;
  }

  if (num < 0) {
    errors.push({ field: fieldName, message: `${fieldName} must not be negative.` });
  }
}

/**
 * Middleware: validate request body for creating a stock item.
 */
export function validateCreateStock(req: Request, res: Response, next: NextFunction): void {
  const errors: ValidationError[] = [];
  const { stockName, caratWeight, caratRate } = req.body;

  validateRequiredString(stockName, 'stockName', errors);
  validateNumberField(caratWeight, 'caratWeight', errors);
  validateNumberField(caratRate, 'caratRate', errors);

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: errors,
      requestId: (req as RequestWithId).requestId || 'unknown',
    });
    return;
  }

  // Coerce to correct types for downstream use
  req.body.caratWeight = Number(caratWeight);
  req.body.caratRate = Number(caratRate);
  if (req.body.itemCount) {
    req.body.itemCount = Number(req.body.itemCount);
  }

  next();
}

/**
 * Middleware: validate request body for updating a stock item.
 */
export function validateUpdateStock(req: Request, res: Response, next: NextFunction): void {
  const errors: ValidationError[] = [];
  const { stockName, caratWeight, caratRate, version } = req.body;

  validateRequiredString(stockName, 'stockName', errors);
  validateNumberField(caratWeight, 'caratWeight', errors);
  validateNumberField(caratRate, 'caratRate', errors);

  if (version === undefined || version === null || version === '') {
    errors.push({ field: 'version', message: 'version is required for optimistic locking.' });
  } else {
    const ver = Number(version);
    if (isNaN(ver) || !isFinite(ver) || ver < 1 || !Number.isInteger(ver)) {
      errors.push({ field: 'version', message: 'version must be a positive integer.' });
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: errors,
      requestId: (req as RequestWithId).requestId || 'unknown',
    });
    return;
  }

  req.body.caratWeight = Number(caratWeight);
  req.body.caratRate = Number(caratRate);
  req.body.version = Number(version);
  if (req.body.itemCount) {
    req.body.itemCount = Number(req.body.itemCount);
  }

  next();
}

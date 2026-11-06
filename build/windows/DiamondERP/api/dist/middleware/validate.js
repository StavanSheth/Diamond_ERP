"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const zod_1 = require("zod");
const logging_1 = require("../infrastructure/logging");
const validateRequest = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            return next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const zodErrors = error.errors || [];
                logging_1.logger.warn(`Validation failed: ${zodErrors.map((e) => e.message).join(', ')}`);
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: zodErrors.map((e) => ({
                        path: e.path.join('.'),
                        message: e.message,
                    })),
                });
            }
            return next(error);
        }
    };
};
exports.validateRequest = validateRequest;
//# sourceMappingURL=validate.js.map
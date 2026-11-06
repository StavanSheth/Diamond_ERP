"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingController = exports.OnboardingController = void 0;
const zod_1 = require("zod");
const onboarding_service_1 = require("./onboarding.service");
const onboarding_authorization_service_1 = require("./onboarding-authorization.service");
const selectUserSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'userId is required'),
});
const createUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3, 'Username must be at least 3 characters').max(50),
    password: zod_1.z.string().min(12, 'Password must be at least 12 characters'),
    displayName: zod_1.z.string().min(1, 'Display name is required').max(100),
    role: zod_1.z.string().optional(),
});
const inspectDatabaseSchema = zod_1.z.object({
    path: zod_1.z.string().min(1, 'Database path is required'),
});
const attachDatabaseSchema = zod_1.z.object({
    path: zod_1.z.string().min(1, 'Database path is required'),
    displayName: zod_1.z.string().max(100).optional(),
    profileCode: zod_1.z.string().max(50).optional(),
    profileName: zod_1.z.string().max(100).optional(),
    userId: zod_1.z.string().optional(),
    targetUserId: zod_1.z.string().optional(),
    confirmAttachment: zod_1.z.boolean(),
});
const createDatabaseSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'Target user ID is required'),
    displayName: zod_1.z.string().min(1, 'Database display name is required').max(100),
    profileCode: zod_1.z.string().max(50).optional(),
    profileName: zod_1.z.string().max(100).optional(),
    provisioningOperationId: zod_1.z.string().optional(),
});
const setupPinSchema = zod_1.z.object({
    pin: zod_1.z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
const registerDeviceSchema = zod_1.z.object({
    deviceName: zod_1.z.string().min(1, 'Device name is required').max(100),
});
class OnboardingController {
    constructor() {
        this.getOnboardingStatus = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'READ_ONBOARDING_STATUS');
                const status = await onboarding_service_1.onboardingService.getOnboardingState();
                res.json({ success: true, data: status });
            }
            catch (err) {
                next(err);
            }
        };
        this.initializeApp = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'INITIALIZE_APPLICATION');
                const status = await onboarding_service_1.onboardingService.initializeApplication();
                res.json({ success: true, data: status });
            }
            catch (err) {
                next(err);
            }
        };
        this.setupPin = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'SETUP_PIN');
                const parsed = setupPinSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const status = await onboarding_service_1.onboardingService.setupPin(parsed.data.pin, parsed.data.metadata);
                res.json({ success: true, data: status });
            }
            catch (err) {
                next(err);
            }
        };
        this.registerDevice = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'REGISTER_DEVICE');
                const parsed = registerDeviceSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const status = await onboarding_service_1.onboardingService.registerDevice(parsed.data.deviceName);
                res.json({ success: true, data: status });
            }
            catch (err) {
                next(err);
            }
        };
        this.discoverUsers = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'DISCOVER_USERS');
                const result = await onboarding_service_1.onboardingService.discoverUsers();
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.selectUser = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'SELECT_USER');
                const parsed = selectUserSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const result = await onboarding_service_1.onboardingService.selectExistingUser(parsed.data.userId);
                res.json({ success: true, data: result, status: result.status });
            }
            catch (err) {
                next(err);
            }
        };
        this.createUser = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'CREATE_USER');
                const parsed = createUserSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const result = await onboarding_service_1.onboardingService.createBusinessUser(parsed.data);
                res.status(201).json({ success: true, data: result, status: result.status });
            }
            catch (err) {
                next(err);
            }
        };
        this.discoverDatabases = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'DISCOVER_DATABASES');
                const result = await onboarding_service_1.onboardingService.discoverDatabases();
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.inspectDatabase = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'INSPECT_DATABASE');
                const parsed = inspectDatabaseSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(parsed.data.path);
                res.json({ success: true, data: preview });
            }
            catch (err) {
                next(err);
            }
        };
        this.attachDatabase = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'ATTACH_DATABASE');
                const parsed = attachDatabaseSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const result = await onboarding_service_1.onboardingService.attachExistingDatabase(parsed.data);
                res.status(201).json({ success: true, data: result, status: result.status });
            }
            catch (err) {
                next(err);
            }
        };
        this.createDatabase = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'CREATE_DATABASE');
                const parsed = createDatabaseSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const result = await onboarding_service_1.onboardingService.createNewDatabase(parsed.data);
                res.status(201).json({ success: true, data: result, status: result.status });
            }
            catch (err) {
                next(err);
            }
        };
        this.completeDatabaseSetup = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'COMPLETE_DATABASE_SETUP');
                const status = await onboarding_service_1.onboardingService.completeDatabaseSetup();
                res.json({ success: true, data: status });
            }
            catch (err) {
                next(err);
            }
        };
        this.completeOnboarding = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'COMPLETE_ONBOARDING');
                const result = await onboarding_service_1.onboardingService.completeOnboarding();
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.resetRecoverableStep = async (req, res, next) => {
            try {
                await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, 'RESET_ONBOARDING_STEP');
                const result = await onboarding_service_1.onboardingService.resetRecoverableOnboardingState();
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.OnboardingController = OnboardingController;
exports.onboardingController = new OnboardingController();
//# sourceMappingURL=onboarding.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingRoutes = exports.onboardingAuthorizationService = exports.onboardingController = exports.onboardingService = void 0;
var onboarding_service_1 = require("./onboarding.service");
Object.defineProperty(exports, "onboardingService", { enumerable: true, get: function () { return onboarding_service_1.onboardingService; } });
var onboarding_controller_1 = require("./onboarding.controller");
Object.defineProperty(exports, "onboardingController", { enumerable: true, get: function () { return onboarding_controller_1.onboardingController; } });
var onboarding_authorization_service_1 = require("./onboarding-authorization.service");
Object.defineProperty(exports, "onboardingAuthorizationService", { enumerable: true, get: function () { return onboarding_authorization_service_1.onboardingAuthorizationService; } });
var onboarding_routes_1 = require("./onboarding.routes");
Object.defineProperty(exports, "onboardingRoutes", { enumerable: true, get: function () { return __importDefault(onboarding_routes_1).default; } });
//# sourceMappingURL=index.js.map
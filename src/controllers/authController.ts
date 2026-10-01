import express from 'express';
import { authConfig } from '../config/auth';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../constants/auth';
import { authService } from '../container';
import type { AuthSessionResult, LoginContext } from '../services/authService';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { authRateLimit } from '../middlewares/authRateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import { readCookie } from '../utils/auth';
import { imageUpload, uploadedFileName } from '../storage/imageUpload';
import { validateRequest } from '../validation/validateRequest';
import {
    confirmPasswordSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    loginSchema,
    registerSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    updateProfileSchema,
    verifyEmailSchema,
} from '../validation/schemas/auth.schemas';

/**
 * Authentication routes of API v1 (mounted at `/auth`). The refresh token never
 * appears in a response body: it travels in an HttpOnly cookie that only the
 * auth routes can see. The attempt limiters guard the endpoints the contract
 * lists for brute-force / token / email abuse.
 */
const authController = express.Router();

const refreshCookieOptions = {
    httpOnly: true,
    secure: authConfig.cookieSecure,
    sameSite: authConfig.cookieSameSite,
    path: REFRESH_COOKIE_PATH,
};

/** Brute-force protection for credential and token endpoints. */
function attemptLimiter(bucket: string): express.RequestHandler {
    return authRateLimit(bucket, authConfig.rateLimit.max, authConfig.rateLimit);
}

/** Email-abuse protection for the endpoints that send mail. */
function emailLimiter(bucket: string): express.RequestHandler {
    return authRateLimit(bucket, authConfig.rateLimit.emailMax, authConfig.rateLimit);
}

function setRefreshCookie(res: express.Response, session: AuthSessionResult): void {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
        ...refreshCookieOptions,
        expires: session.refreshTokenExpiresAt,
        maxAge: authConfig.refreshTokenTtlSeconds * 1000,
    });
}

function clearRefreshCookie(res: express.Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
}

/** IP and user agent of the attempt; observability data for the failed-log table. */
function loginContext(req: express.Request): LoginContext {
    return {
        ip: req.ip ?? req.socket.remoteAddress ?? '',
        userAgent: req.header('user-agent') ?? '',
    };
}

authController.post(
    '/register',
    attemptLimiter('register'),
    validateRequest({ body: registerSchema }),
    asyncHandler(async (req, res) => {
        res.status(201).json(await authService.register(req.body));
    }),
);

authController.post(
    '/verify-email',
    attemptLimiter('verify-email'),
    validateRequest({ body: verifyEmailSchema }),
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.verifyEmail(req.body));
    }),
);

authController.post(
    '/resend-verification',
    emailLimiter('resend-verification'),
    validateRequest({ body: resendVerificationSchema }),
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.resendVerification(req.body));
    }),
);

authController.post(
    '/login',
    attemptLimiter('login'),
    validateRequest({ body: loginSchema }),
    asyncHandler(async (req, res) => {
        const session = await authService.login(req.body, loginContext(req));
        setRefreshCookie(res, session);
        res.status(200).json(session.session);
    }),
);

authController.post('/refresh', attemptLimiter('refresh'), asyncHandler(async (req, res) => {
    try {
        const session = await authService.refresh(readCookie(req.headers.cookie, REFRESH_COOKIE_NAME));
        setRefreshCookie(res, session);
        res.status(200).json(session.session);
    } catch (error) {
        // A refresh session that is refused must not leave a stale cookie behind.
        clearRefreshCookie(res);
        throw error;
    }
}));

authController.post('/logout', asyncHandler(async (req, res) => {
    const result = await authService.logout(readCookie(req.headers.cookie, REFRESH_COOKIE_NAME));
    clearRefreshCookie(res);
    res.status(200).json(result);
}));

authController.get('/me', requireAuthentication, asyncHandler(async (req, res) => {
    res.status(200).json(await authService.me(actorFrom(req).id));
}));

authController.put(
    '/me',
    validateRequest({ body: updateProfileSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.updateProfile(actorFrom(req).id, req.body));
    }),
);

/** Re-authentication gate used before a sensitive profile change. */
authController.post(
    '/confirm-password',
    attemptLimiter('confirm-password'),
    validateRequest({ body: confirmPasswordSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.confirmPassword(actorFrom(req).id, req.body));
    }),
);

authController.put(
    '/me/password',
    attemptLimiter('change-password'),
    validateRequest({ body: changePasswordSchema }),
    requireAuthentication,
    asyncHandler(async (req, res) => {
        await authService.changePassword(actorFrom(req).id, req.body);
        res.status(204).send();
    }),
);

authController.get('/me/image', requireAuthentication, asyncHandler(async (req, res) => {
    res.status(200).json(await authService.getProfileImage(actorFrom(req).id));
}));

authController.post('/me/image', requireAuthentication, imageUpload, asyncHandler(async (req, res) => {
    res.status(201).json(await authService.setProfileImage(actorFrom(req).id, uploadedFileName(req)));
}));

authController.delete('/me/image', requireAuthentication, asyncHandler(async (req, res) => {
    await authService.removeProfileImage(actorFrom(req).id);
    res.status(204).send();
}));

authController.post(
    '/forgot-password',
    emailLimiter('forgot-password'),
    validateRequest({ body: forgotPasswordSchema }),
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.forgotPassword(req.body));
    }),
);

authController.post(
    '/reset-password',
    attemptLimiter('reset-password'),
    validateRequest({ body: resetPasswordSchema }),
    asyncHandler(async (req, res) => {
        res.status(200).json(await authService.resetPassword(req.body));
    }),
);

authController.use(apiErrorMiddleware);
authController.use(routeNotFoundLogsMiddleware);

export default authController;

import express from 'express';
import { authConfig } from '../config/auth';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../constants/auth';
import { authService } from '../container';
import { apiErrorMiddleware } from '../middlewares/apiErrorMiddleware';
import { routeNotFoundLogsMiddleware } from '../middlewares/routeNotFoundLogsMiddleware';
import { actorFrom, requireAuthentication } from '../middlewares/authBoundary';
import { authRateLimit } from '../middlewares/authRateLimit';
import type { AuthSessionResult } from '../services/authService';
import { asyncHandler } from '../utils/asyncHandler';
import { readCookie } from '../utils/auth';

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

authController.post('/register', attemptLimiter('register'), asyncHandler(async (req, res) => {
    res.status(201).json(await authService.register(req.body));
}));

authController.post('/verify-email', asyncHandler(async (req, res) => {
    res.status(200).json(await authService.verifyEmail(req.body));
}));

authController.post('/resend-verification', emailLimiter('resend-verification'), asyncHandler(async (req, res) => {
    res.status(200).json(await authService.resendVerification(req.body));
}));

authController.post('/login', attemptLimiter('login'), asyncHandler(async (req, res) => {
    const session = await authService.login(req.body);
    setRefreshCookie(res, session);
    res.status(200).json(session.session);
}));

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

authController.post('/forgot-password', emailLimiter('forgot-password'), asyncHandler(async (req, res) => {
    res.status(200).json(await authService.forgotPassword(req.body));
}));

authController.post('/reset-password', attemptLimiter('reset-password'), asyncHandler(async (req, res) => {
    res.status(200).json(await authService.resetPassword(req.body));
}));

authController.use(apiErrorMiddleware);
authController.use(routeNotFoundLogsMiddleware);

export default authController;

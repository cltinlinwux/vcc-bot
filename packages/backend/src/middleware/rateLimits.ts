import rateLimit from 'express-rate-limit';

export const LINK_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LINK_RATE_LIMIT_MAX = 5;

/**
 * Brute-force protection for bot link codes: at most 5 failed attempts
 * per IP per 15 minutes. Successful links are not counted so a bot host
 * serving many users from one IP is not locked out by legitimate traffic.
 */
export const linkCodeLimiter = rateLimit({
  windowMs: LINK_RATE_LIMIT_WINDOW_MS,
  max: LINK_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many link attempts, try again later', code: 'RATE_LIMITED' },
});

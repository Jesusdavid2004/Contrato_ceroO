import rateLimit from 'express-rate-limit';

const isTestEnvironment = process.env.NODE_ENV === 'test';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isTestEnvironment ? 1000 : 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
    details: 'Too many authentication attempts. Please try again later.',
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isTestEnvironment ? 1000 : 20, // 20 uploads per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
    details: 'Too many upload attempts. Please try again later.',
  },
});

export const aiIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTestEnvironment ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
  },
});

export const aiUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTestEnvironment ? 1000 : 10,
  keyGenerator: (req) => req.user?.id || 'authenticated-user',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
  },
});

const ASSISTANT_WINDOW_MS = 5 * 60 * 1000;
const ASSISTANT_IP_LIMIT = 60;
const ASSISTANT_USER_LIMIT = 20;

/** Chat needs far more headroom than one-shot AI endpoints; the daily quota is the real budget. */
export const assistantIpLimiter = rateLimit({
  windowMs: ASSISTANT_WINDOW_MS,
  limit: isTestEnvironment ? 1000 : ASSISTANT_IP_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
  },
});

export const assistantUserLimiter = rateLimit({
  windowMs: ASSISTANT_WINDOW_MS,
  limit: isTestEnvironment ? 1000 : ASSISTANT_USER_LIMIT,
  keyGenerator: (req) => req.user?.id || 'authenticated-user',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
  },
});

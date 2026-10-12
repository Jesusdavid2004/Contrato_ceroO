import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30, // 30 requests per window
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
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20, // 20 uploads per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RateLimitExceeded',
    message_key: 'errors.rate_limit_exceeded',
    details: 'Too many upload attempts. Please try again later.',
  },
});

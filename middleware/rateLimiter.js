const rateLimit = require('express-rate-limit');

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: (process.env.REQUEST_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes default
  max: 100, // Max requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 auth attempts
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Submission rate limiter
const submissionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: parseInt(process.env.SUBMISSION_LIMIT_PER_DAY) || 10,
  message: {
    error: 'Daily submission limit exceeded. Try again tomorrow.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user, not per IP
    return req.user ? req.user.id : req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for admins
    return req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');
  }
});

// Admin action rate limiter
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Max 50 admin actions per minute
  message: {
    error: 'Too many admin actions, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  global: globalLimiter,
  auth: authLimiter,
  submission: submissionLimiter,
  admin: adminLimiter
};
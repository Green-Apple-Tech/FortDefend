require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();

// ─── Security headers via Helmet ────────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://fortdefend-production.up.railway.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman in dev)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// ─── Body parsing ────────────────────────────────────────────────────────────
// Stripe webhooks need the raw body and must NOT be parsed by express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '10mb' }));

function skipStripeWebhook(req) {
  return req.originalUrl === '/api/webhooks/stripe' || req.originalUrl.startsWith('/api/webhooks/stripe/');
}

app.use((req, res, next) => {
  if (skipStripeWebhook(req)) return next();
  express.json({ limit: '10mb' })(req, res, next);
});

app.use((req, res, next) => {
  if (skipStripeWebhook(req)) return next();
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// ─── Request logging ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Rate limiting ───────────────────────────────────────────────────────────
// General API rate limit: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  skip: (req) =>
    req.originalUrl === '/api/webhooks/stripe' ||
    req.originalUrl.startsWith('/api/webhooks/stripe/'),
});

// Strict auth rate limit: 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes.' },
});

// Apply general limiter to all API routes
app.use('/api', generalLimiter);

// Apply strict limiter to auth routes specifically
app.use('/api/auth', authLimiter);

// ─── Health check (no auth, no rate limit) ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/orgs',         require('./routes/orgs'));
app.use('/api/api-keys',     require('./routes/api-keys'));
app.use('/api/v1/devices',   require('./routes/v1/devices'));
app.use('/api/v1/alerts',    require('./routes/v1/alerts'));
app.use('/api/integrations', require('./routes/integrations'));
const billingRouter = require('./routes/billing');
app.use('/api/billing', billingRouter);
app.use('/api/webhooks/stripe', billingRouter.webhookRouter);
// app.use('/api/devices',      require('./routes/devices'));
// app.use('/api/agents',       require('./routes/agents'));
// app.use('/api/webhooks',     require('./routes/webhooks'));
// app.use('/api/reports',      require('./routes/reports'));
// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
// Never leaks stack traces in production
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
    return res.status(status).json({
      error: err.message || 'Internal server error',
      stack: err.stack,
    });
  }

  // Production: generic message only
  console.error(`[ERROR] ${status} - ${err.message} - ${req.method} ${req.path}`);
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PatchPilot server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;

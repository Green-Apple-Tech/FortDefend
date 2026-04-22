const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const db = require('./database');
const { startTrialMonitor } = require('./agents/trialMonitor');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://fortdefend.com',
  'https://app.fortdefend.com',
  'https://fortdefend-production.up.railway.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Stripe webhook — raw body BEFORE json parser ──────────────────────────────
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/orgs',            require('./routes/orgs'));
app.use('/api/billing',         require('./routes/billing'));
app.use('/api/msp',             require('./routes/msp'));
app.use('/api/android',         require('./routes/android'));
app.use('/api/nmap',            require('./routes/nmap'));
app.use('/api/integrations',    require('./routes/integrations'));
app.use('/api/reports',         require('./routes/reports'));
app.use('/api/enrollment',      require('./routes/enrollment'));
app.use('/api/extension',       require('./routes/chromebook-extension'));
app.use('/api/devices',         require('./routes/devices'));
app.use('/api/remediation',     require('./routes/remediation'));
app.use('/api/agent',           require('./routes/agent'));
app.use('/api/reboot-policies', require('./routes/rebootPolicies'));
app.use('/api/groups',          require('./routes/groups'));

// ── Agent binary download ─────────────────────────────────────────────────────
app.get('/download/agent.exe', (req, res) => {
  const p = path.join(__dirname, '..', 'agent', 'agent.exe');
  if (!fs.existsSync(p)) {
    return res.status(404).json({ error: 'agent.exe not found.' });
  }
  return res.download(p, 'agent.exe');
});

// ── Serve React frontend ──────────────────────────────────────────────────────
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ── API 404 ───────────────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  if (status >= 500) {
    console.error('[FortDefend Error]', err.message, isDev ? err.stack : '');
  }

  res.status(status).json({
    error: isDev ? err.message : 'Something went wrong. Please try again.',
    ...(isDev && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[FortDefend] Server running on port ${PORT}`);
  startTrialMonitor();
});

module.exports = app;
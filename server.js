require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Route imports - убедитесь что пути правильные
const authRoutes = require('/routes/auth');
const submissionRoutes = require('./routes/submissions');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

// Middleware imports
const { isAuthenticated, isAdmin } = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadDir}`);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"]
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
  credentials: true
}));

// Rate limiting
app.use(rateLimiter.global);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Initialize Passport configuration
require('./config/passport');

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/auth', authRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// HTML Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  // Check if user is banned
  if (req.user.isBanned) {
    return res.redirect('/?error=banned');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// 404 handler for HTML routes
app.use((req, res) => {
  // Check if file exists in public directory
  const filePath = path.join(__dirname, 'public', '404.html');
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>404 - Not Found</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <h1>404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">Go back to home</a>
      </body>
      </html>
    `);
  }
});

// Error handler (должен быть последним middleware)
app.use(errorHandler);

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  console.log(`\n👋 ${signal} received, shutting down gracefully`);
  
  // Close server
  server.close(() => {
    console.log('🔒 HTTP server closed');
    
    // Close database connections if needed
    // prisma.$disconnect()
    
    console.log('✅ Process terminated gracefully');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`🎮 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Log important configuration
  console.log('\n📋 Configuration:');
  console.log(`   Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);
  console.log(`   Epic OAuth: ${process.env.EPIC_CLIENT_ID ? 'Configured' : 'Not configured'}`);
  console.log(`   Session Secret: ${process.env.SESSION_SECRET ? 'Configured' : 'Using fallback'}`);
  console.log(`   Upload Directory: ${uploadDir}`);
  console.log(`   Max File Size: ${(parseInt(process.env.MAX_FILE_SIZE) || 100000000) / 1024 / 1024}MB`);
});
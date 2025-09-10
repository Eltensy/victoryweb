const express = require('express');
const passport = require('passport');
const rateLimiter = require('../middleware/rateLimiter');
const router = express.Router();

// Epic Games OAuth
router.get('/epic', 
  rateLimiter.auth,
  passport.authenticate('epic', {
    scope: ['basic_profile']
  })
);

router.get('/epic/callback',
  rateLimiter.auth,
  passport.authenticate('epic', { 
    failureRedirect: '/?error=auth_failed',
    failureMessage: true
  }),
  (req, res) => {
    // Check if user is banned
    if (req.user.isBanned) {
      return res.redirect('/?error=banned');
    }
    
    // Successful authentication
    console.log(`✅ User ${req.user.nickname} logged in`);
    res.redirect('/dashboard');
  }
);

// Logout
router.post('/logout', (req, res) => {
  const nickname = req.user?.nickname;
  
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('Session destroy error:', sessionErr);
      }
      
      console.log(`👋 User ${nickname} logged out`);
      res.json({ success: true, message: 'Logged out successfully' });
    });
  });
});

// Get current user info
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, nickname, balance, role, createdAt, isBanned } = req.user;
    
    // Check if user is banned
    if (isBanned) {
      return res.status(403).json({ 
        error: 'Account banned',
        message: 'Your account has been banned'
      });
    }
    
    res.json({ 
      id, 
      nickname, 
      balance, 
      role, 
      createdAt,
      isAuthenticated: true 
    });
  } else {
    res.json({ 
      isAuthenticated: false 
    });
  }
});

// Check auth status
router.get('/status', (req, res) => {
  res.json({ 
    isAuthenticated: req.isAuthenticated(),
    user: req.user ? {
      id: req.user.id,
      nickname: req.user.nickname,
      role: req.user.role,
      isBanned: req.user.isBanned
    } : null
  });
});

module.exports = router;

// Authentication related functionality

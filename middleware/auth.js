const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && !req.user.isBanned) {
    return next();
  }
  
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  res.redirect('/');
};

const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'MODERATOR')) {
    return next();
  }
  
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.redirect('/');
};

const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  res.redirect('/');
};

const logAdminAction = async (adminId, action, details, req) => {
  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        details,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
};

const canModifyUser = (adminUser, targetUserId) => {
  // Admins cannot modify their own balance
  if (adminUser.id === targetUserId) {
    return false;
  }
  
  // Only super admins can modify other admins
  if (adminUser.role === 'MODERATOR') {
    return true; // Moderators can modify regular users
  }
  
  return true;
};

module.exports = { 
  isAuthenticated, 
  isAdmin, 
  isSuperAdmin, 
  logAdminAction,
  canModifyUser 
};
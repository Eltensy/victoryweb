const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const { isAuthenticated, isAdmin, isSuperAdmin, logAdminAction, canModifyUser } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();
const prisma = new PrismaClient();

// Apply admin middleware and rate limiting to all routes
router.use(isAuthenticated, isAdmin, rateLimiter.admin);

// Validation schemas
const reviewSubmissionSchema = Joi.object({
  status: Joi.string().valid('APPROVED', 'REJECTED').required(),
  rejectReason: Joi.string().when('status', {
    is: 'REJECTED',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  bonusAmount: Joi.number().min(0).max(1000).optional()
});

const addBalanceSchema = Joi.object({
  amount: Joi.number().required().min(0.01).max(10000),
  reason: Joi.string().required().min(3).max(200)
});

const updateUserSchema = Joi.object({
  role: Joi.string().valid('USER', 'MODERATOR', 'ADMIN').optional(),
  isBanned: Joi.boolean().optional(),
  balance: Joi.number().min(0).max(100000).optional()
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      totalPayouts,
      todaySubmissions
    ] = await Promise.all([
      prisma.user.count(),
      prisma.submission.count(),
      prisma.submission.count({ where: { status: 'PENDING' } }),
      prisma.submission.count({ where: { status: 'APPROVED' } }),
      prisma.submission.count({ where: { status: 'REJECTED' } }),
      prisma.payout.aggregate({ _sum: { amount: true } }),
      prisma.submission.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    // Get submissions by category
    const submissionsByCategory = await prisma.submission.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } }
    });

    // Get recent activity
    const recentSubmissions = await prisma.submission.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { nickname: true }
        }
      }
    });

    res.json({
      overview: {
        totalUsers,
        totalSubmissions,
        pendingSubmissions,
        approvedSubmissions,
        rejectedSubmissions,
        todaySubmissions,
        totalPayouts: totalPayouts._sum.amount || 0
      },
      submissionsByCategory: submissionsByCategory.map(item => ({
        category: item.category,
        count: item._count.category
      })),
      recentSubmissions: recentSubmissions.map(sub => ({
        id: sub.id,
        user: sub.user.nickname,
        category: sub.category,
        status: sub.status,
        createdAt: sub.createdAt
      }))
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get all submissions with filters and pagination
router.get('/submissions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    
    const filters = {};
    
    // Apply filters
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.category) {
      filters.category = req.query.category;
    }
    
    if (req.query.userId) {
      filters.userId = req.query.userId;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filters.createdAt = {};
      if (req.query.dateFrom) {
        filters.createdAt.gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        filters.createdAt.lte = new Date(req.query.dateTo);
      }
    }

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, nickname: true, balance: true }
          },
          reviewer: {
            select: { nickname: true }
          }
        }
      }),
      prisma.submission.count({ where: filters })
    ]);

    res.json({
      submissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get admin submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Review submission (approve/reject)
router.patch('/submissions/:id/review', async (req, res) => {
  try {
    const { error, value } = reviewSubmissionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { user: true }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'PENDING') {
      return res.status(400).json({ error: 'Submission already reviewed' });
    }

    // Update submission
    const updatedSubmission = await prisma.submission.update({
      where: { id: req.params.id },
      data: {
        status: value.status,
        rejectReason: value.rejectReason || null,
        reviewedBy: req.user.id,
        reviewedAt: new Date()
      }
    });

    // Add bonus balance if approved and bonus specified
    if (value.status === 'APPROVED' && value.bonusAmount > 0) {
      await prisma.user.update({
        where: { id: submission.userId },
        data: { balance: { increment: value.bonusAmount } }
      });

      // Log payout
      await prisma.payout.create({
        data: {
          userId: submission.userId,
          amount: value.bonusAmount,
          reason: `Approved submission: ${submission.category}`,
          adminId: req.user.id,
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });
    }

    // Log admin action
    await logAdminAction(
      req.user.id,
      'REVIEW_SUBMISSION',
      `${value.status} submission ${submission.id} from ${submission.user.nickname}${
        value.bonusAmount ? ` with ${value.bonusAmount} bonus` : ''
      }`,
      req
    );

    console.log(`✅ Submission ${value.status.toLowerCase()} by ${req.user.nickname}: ${submission.id}`);

    res.json({
      message: `Submission ${value.status.toLowerCase()} successfully`,
      submission: updatedSubmission
    });

  } catch (error) {
    console.error('Review submission error:', error);
    res.status(500).json({ error: 'Failed to review submission' });
  }
});

// Bulk review submissions
router.patch('/submissions/bulk-review', async (req, res) => {
  try {
    const { submissionIds, status, rejectReason } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ error: 'No submissions selected' });
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (status === 'REJECTED' && !rejectReason) {
      return res.status(400).json({ error: 'Reject reason required' });
    }

    // Update submissions
    const result = await prisma.submission.updateMany({
      where: {
        id: { in: submissionIds },
        status: 'PENDING'
      },
      data: {
        status,
        rejectReason: status === 'REJECTED' ? rejectReason : null,
        reviewedBy: req.user.id,
        reviewedAt: new Date()
      }
    });

    // Log admin action
    await logAdminAction(
      req.user.id,
      'BULK_REVIEW_SUBMISSIONS',
      `Bulk ${status.toLowerCase()} ${result.count} submissions`,
      req
    );

    console.log(`📋 Bulk review by ${req.user.nickname}: ${result.count} submissions ${status.toLowerCase()}`);

    res.json({
      message: `${result.count} submissions ${status.toLowerCase()} successfully`,
      count: result.count
    });

  } catch (error) {
    console.error('Bulk review error:', error);
    res.status(500).json({ error: 'Failed to bulk review submissions' });
  }
});

// Get all users with filters
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    
    const filters = {};
    
    if (req.query.role) {
      filters.role = req.query.role;
    }
    
    if (req.query.isBanned !== undefined) {
      filters.isBanned = req.query.isBanned === 'true';
    }

    if (req.query.search) {
      filters.nickname = {
        contains: req.query.search,
        mode: 'insensitive'
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          epicId: true,
          nickname: true,
          balance: true,
          role: true,
          isBanned: true,
          createdAt: true,
          _count: {
            select: {
              submissions: true,
              payouts: true
            }
          }
        }
      }),
      prisma.user.count({ where: filters })
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user
router.patch('/users/:id', async (req, res) => {
  try {
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    if (!canModifyUser(req.user, req.params.id)) {
      return res.status(403).json({ error: 'Cannot modify this user' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only super admins can change roles
    if (value.role && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only super admins can change roles' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: value
    });

    // Log admin action
    await logAdminAction(
      req.user.id,
      'UPDATE_USER',
      `Updated user ${user.nickname}: ${JSON.stringify(value)}`,
      req
    );

    console.log(`👤 User updated by ${req.user.nickname}: ${user.nickname}`);

    res.json({
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        nickname: updatedUser.nickname,
        balance: updatedUser.balance,
        role: updatedUser.role,
        isBanned: updatedUser.isBanned
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Add balance to user
router.post('/users/:id/add-balance', async (req, res) => {
  try {
    const { error, value } = addBalanceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    if (!canModifyUser(req.user, req.params.id)) {
      return res.status(403).json({ error: 'Cannot modify this user' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user balance and create payout record
    const [updatedUser, payout] = await Promise.all([
      prisma.user.update({
        where: { id: req.params.id },
        data: { balance: { increment: value.amount } }
      }),
      prisma.payout.create({
        data: {
          userId: req.params.id,
          amount: value.amount,
          reason: value.reason,
          adminId: req.user.id,
          status: 'COMPLETED',
          completedAt: new Date()
        }
      })
    ]);

    // Log admin action
    await logAdminAction(
      req.user.id,
      'ADD_BALANCE',
      `Added ${value.amount} to ${user.nickname}: ${value.reason}`,
      req
    );

    console.log(`💰 Balance added by ${req.user.nickname}: ${value.amount} to ${user.nickname}`);

    res.json({
      message: 'Balance added successfully',
      newBalance: updatedUser.balance,
      payout: {
        id: payout.id,
        amount: payout.amount,
        reason: payout.reason
      }
    });

  } catch (error) {
    console.error('Add balance error:', error);
    res.status(500).json({ error: 'Failed to add balance' });
  }
});

// Get admin logs
router.get('/logs', isSuperAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.adminId) {
      filters.adminId = req.query.adminId;
    }
    if (req.query.action) {
      filters.action = req.query.action;
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: {
            select: { nickname: true }
          }
        }
      }),
      prisma.adminLog.count({ where: filters })
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get admin logs error:', error);
    res.status(500).json({ error: 'Failed to fetch admin logs' });
  }
});

module.exports = router;
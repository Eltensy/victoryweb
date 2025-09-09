const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user profile
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        epicId: true,
        nickname: true,
        balance: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            payouts: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user statistics
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const [submissionStats, payoutStats, recentSubmissions] = await Promise.all([
      prisma.submission.groupBy({
        by: ['status'],
        where: { userId: req.user.id },
        _count: { status: true }
      }),
      prisma.payout.aggregate({
        where: { userId: req.user.id },
        _sum: { amount: true },
        _count: { amount: true }
      }),
      prisma.submission.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          category: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    const stats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    submissionStats.forEach(stat => {
      stats.total += stat._count.status;
      stats[stat.status.toLowerCase()] = stat._count.status;
    });

    res.json({
      submissions: stats,
      payouts: {
        total: payoutStats._sum.amount || 0,
        count: payoutStats._count.amount || 0
      },
      recentSubmissions
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get user payout history
router.get('/payouts', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: {
            select: { nickname: true }
          }
        }
      }),
      prisma.payout.count({
        where: { userId: req.user.id }
      })
    ]);

    res.json({
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Get user dashboard data
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const [user, stats, recentSubmissions, recentPayouts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          nickname: true,
          balance: true,
          role: true,
          createdAt: true
        }
      }),
      prisma.submission.groupBy({
        by: ['status'],
        where: { userId: req.user.id },
        _count: { status: true }
      }),
      prisma.submission.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          category: true,
          status: true,
          createdAt: true,
          rejectReason: true
        }
      }),
      prisma.payout.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          amount: true,
          reason: true,
          createdAt: true,
          status: true
        }
      })
    ]);

    const submissionStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      submissionStats.total += stat._count.status;
      submissionStats[stat.status.toLowerCase()] = stat._count.status;
    });

    res.json({
      user,
      stats: submissionStats,
      recentSubmissions,
      recentPayouts
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
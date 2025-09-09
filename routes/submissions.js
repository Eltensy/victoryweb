const express = require('express');
const multer = require('multer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { isAuthenticated } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();
const prisma = new PrismaClient();

// File storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024 // 100MB default
  }
});

// Validation schemas
const createSubmissionSchema = Joi.object({
  category: Joi.string().required().min(2).max(50),
  description: Joi.string().optional().max(500)
});

// Apply authentication to all routes
router.use(isAuthenticated);

// Get user's submissions
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const filters = { userId: req.user.id };

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.category) {
      filters.category = req.query.category;
    }

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
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
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Get single submission
router.get('/:id', async (req, res) => {
  try {
    const submission = await prisma.submission.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id // Ensure user can only access their own submissions
      },
      include: {
        reviewer: {
          select: { nickname: true }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(submission);

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Create new submission
router.post('/', rateLimiter.submission, upload.single('file'), async (req, res) => {
  try {
    // Check if user is banned
    if (req.user.isBanned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }

    // Validate request body
    const { error, value } = createSubmissionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // Determine file type
    const fileType = req.file.mimetype.startsWith('image/') ? 'IMAGE' : 'VIDEO';

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        userId: req.user.id,
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType,
        fileSize: req.file.size,
        category: value.category,
        description: value.description || null
      }
    });

    // Update user's last submission time
    await prisma.user.update({
      where: { id: req.user.id },
      data: { lastSubmission: new Date() }
    });

    console.log(`📤 New submission from ${req.user.nickname}: ${submission.id} (${value.category})`);

    res.status(201).json({
      message: 'Submission created successfully',
      submission: {
        id: submission.id,
        category: submission.category,
        fileType: submission.fileType,
        status: submission.status,
        createdAt: submission.createdAt
      }
    });

  } catch (error) {
    console.error('Create submission error:', error);

    // Clean up uploaded file on error
    if (req.file) {
      const fs = require('fs');
      const filePath = path.join(process.env.UPLOAD_DIR || './uploads', req.file.filename);
      fs.unlink(filePath, (unlinkError) => {
        if (unlinkError) console.error('File cleanup error:', unlinkError);
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large' });
    }

    res.status(500).json({ error: 'Failed to create submission' });
  }
});

// Delete submission (only pending ones)
router.delete('/:id', async (req, res) => {
  try {
    const submission = await prisma.submission.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
        status: 'PENDING' // Only allow deletion of pending submissions
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found or cannot be deleted' });
    }

    // Delete file from storage
    const fs = require('fs');
    const filePath = path.join(__dirname, '..', submission.fileUrl);
    fs.unlink(filePath, (error) => {
      if (error) console.error('File deletion error:', error);
    });

    // Delete from database
    await prisma.submission.delete({
      where: { id: req.params.id }
    });

    console.log(`🗑️ Submission deleted by ${req.user.nickname}: ${req.params.id}`);

    res.json({ message: 'Submission deleted successfully' });

  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// Get submission categories (for dropdown)
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await prisma.submission.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
      take: 20
    });

    const popularCategories = categories.map(cat => ({
      name: cat.category,
      count: cat._count.category
    }));

    // Add some default categories if none exist
    const defaultCategories = [
      'Victory Royale',
      'Epic Kill',
      'Funny Moment',
      'Clutch Play',
      'Bug/Glitch',
      'Creative Build',
      'Trick Shot',
      'Team Play',
      'Solo Win',
      'High Kill Game'
    ];

    const allCategories = [...new Set([
      ...popularCategories.map(c => c.name),
      ...defaultCategories
    ])];

    res.json({
      popular: popularCategories,
      all: allCategories.slice(0, 30)
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get file upload limits
router.get('/meta/limits', (req, res) => {
  res.json({
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024,
    maxSubmissionsPerDay: parseInt(process.env.SUBMISSION_LIMIT_PER_DAY) || 10,
    allowedTypes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'
    ]
  });
});

module.exports = router;
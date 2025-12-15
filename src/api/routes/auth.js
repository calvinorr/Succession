const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const dal = require('../../dal/dal');
const { BCRYPT_ROUNDS, generateToken, verifyToken, extractToken } = require('../helpers');

// POST /auth/register - Create a new expert account
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, jobTitle, department, bio } = req.body;

    if (!username || typeof username !== 'string' || username.length < 3) {
      return res.status(400).json({
        error: 'Username is required and must be at least 3 characters.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'Password is required and must be at least 6 characters.',
      });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Name is required.',
      });
    }

    const existingExpert = dal.findByField('experts', 'username', username);
    if (existingExpert) {
      return res.status(409).json({
        error: 'Username already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const expertId = Math.random().toString(36).substring(2, 15);
    const expert = {
      id: expertId,
      username,
      passwordHash,
      name,
      jobTitle: jobTitle || null,
      department: department || null,
      bio: bio || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dal.writeData(`experts/${expertId}`, expert);

    const { passwordHash: _, ...safeExpert } = expert;
    res.status(201).json(safeExpert);
  } catch (error) {
    console.error('Error registering expert:', error);
    res.status(500).json({
      error: 'Internal server error during registration',
      details: error.message,
    });
  }
});

// POST /auth/login - Authenticate expert and return session info
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required.',
      });
    }

    const expert = dal.findByField('experts', 'username', username);
    if (!expert) {
      return res.status(401).json({
        error: 'Invalid credentials.',
      });
    }

    const isValid = await bcrypt.compare(password, expert.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid credentials.',
      });
    }

    // Generate JWT token
    const token = generateToken(expert);
    const { passwordHash: _, ...safeExpert } = expert;
    res.json({
      message: 'Login successful',
      token,
      expiresIn: '24h',
      expert: safeExpert,
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({
      error: 'Internal server error during login',
      details: error.message,
    });
  }
});

// POST /auth/logout - Invalidate session
router.post('/logout', (req, res) => {
  // JWT tokens are stateless - client should discard the token
  // For additional security, implement a token blacklist if needed
  res.json({ message: 'Logout successful. Please discard your token.' });
});

// GET /auth/me - Get current expert profile
router.get('/me', (req, res) => {
  try {
    // Try JWT token first (Authorization: Bearer <token>)
    const token = extractToken(req);
    let expertId = null;

    if (token) {
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          error: 'Invalid or expired token.',
        });
      }
      expertId = decoded.expertId;
    } else {
      // Fallback to legacy methods for backwards compatibility
      expertId = req.query.expertId || req.headers['x-expert-id'];
    }

    if (!expertId) {
      return res.status(401).json({
        error: 'Authentication required. Provide Authorization header with Bearer token.',
      });
    }

    const expert = dal.readData(`experts/${expertId}`);
    if (!expert) {
      return res.status(404).json({
        error: 'Expert not found.',
      });
    }

    const { passwordHash: _, ...safeExpert } = expert;
    res.json(safeExpert);
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({
      error: 'Internal server error getting profile',
      details: error.message,
    });
  }
});

// PUT /auth/me - Update current expert profile
router.put('/me', async (req, res) => {
  try {
    // Try JWT token first (Authorization: Bearer <token>)
    const token = extractToken(req);
    let expertId = null;

    if (token) {
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          error: 'Invalid or expired token.',
        });
      }
      expertId = decoded.expertId;
    } else {
      // Fallback to legacy methods for backwards compatibility
      expertId = req.query.expertId || req.headers['x-expert-id'];
    }

    if (!expertId) {
      return res.status(401).json({
        error: 'Authentication required. Provide Authorization header with Bearer token.',
      });
    }

    const expert = dal.readData(`experts/${expertId}`);
    if (!expert) {
      return res.status(404).json({
        error: 'Expert not found.',
      });
    }

    const { name, jobTitle, department, bio, password } = req.body;

    if (name !== undefined) expert.name = name;
    if (jobTitle !== undefined) expert.jobTitle = jobTitle;
    if (department !== undefined) expert.department = department;
    if (bio !== undefined) expert.bio = bio;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Password must be at least 6 characters.',
        });
      }
      expert.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    expert.updatedAt = new Date().toISOString();
    dal.writeData(`experts/${expertId}`, expert);

    const { passwordHash: _, ...safeExpert } = expert;
    res.json(safeExpert);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      error: 'Internal server error updating profile',
      details: error.message,
    });
  }
});

module.exports = router;

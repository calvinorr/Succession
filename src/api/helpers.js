const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const dal = require('../dal/dal');
const llm = require('../services/llm');
const noteTaker = require('../agents/note-taker');

// Configuration
const SNAPSHOT_INTERVAL = 5;
const BCRYPT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'succession-dev-secret-change-in-production';
const TOKEN_EXPIRY = '24h';

/**
 * Generate a JWT token for an expert
 */
function generateToken(expert) {
  return jwt.sign(
    { expertId: expert.id, username: expert.username },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Verify and decode a JWT token
 * Returns the decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 * Supports "Bearer <token>" format
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Authentication middleware for protected routes
 * Validates JWT token and attaches expert to req.expert
 */
function authMiddleware(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid token in the Authorization header'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Please login again to get a new token'
    });
  }

  // Load expert from database
  const expert = dal.readData(`experts/${decoded.expertId}`);
  if (!expert) {
    return res.status(401).json({
      error: 'Expert not found',
      message: 'The account associated with this token no longer exists'
    });
  }

  // Attach expert to request (without password hash)
  const { passwordHash, ...safeExpert } = expert;
  req.expert = safeExpert;
  req.expertId = decoded.expertId;

  next();
}

/**
 * Optional auth middleware - doesn't fail if no token, but attaches expert if valid
 */
function optionalAuthMiddleware(req, res, next) {
  const token = extractToken(req);

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const expert = dal.readData(`experts/${decoded.expertId}`);
      if (expert) {
        const { passwordHash, ...safeExpert } = expert;
        req.expert = safeExpert;
        req.expertId = decoded.expertId;
      }
    }
  }

  next();
}

/**
 * Helper to list all files in a data directory
 */
function listDataDir(subdir) {
  const dirPath = path.join('./data', subdir);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Generate a random ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Simple Levenshtein similarity (0-1 score)
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  if ((longer.length - shorter.length) / longer.length > 0.5) return 0;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

/**
 * Categorize insight into knowledge area
 */
function categorizeInsight(insight) {
  const lower = insight.toLowerCase();
  if (lower.includes('pitfall') || lower.includes('mistake') || lower.includes('avoid') || lower.includes('careful') || lower.includes('risk')) {
    return 'pitfalls';
  }
  if (lower.includes('tip') || lower.includes('recommend') || lower.includes('best practice') || lower.includes('always') || lower.includes('never')) {
    return 'tips';
  }
  if (lower.includes('contact') || lower.includes('stakeholder') || lower.includes('team') || lower.includes('department')) {
    return 'contacts';
  }
  if (lower.includes('system') || lower.includes('software') || lower.includes('tool') || lower.includes('template')) {
    return 'systems';
  }
  if (lower.includes('deadline') || lower.includes('date') || lower.includes('when') || lower.includes('schedule') || lower.includes('timeline')) {
    return 'dates';
  }
  if (lower.includes('step') || lower.includes('process') || lower.includes('task') || lower.includes('action')) {
    return 'tasks';
  }
  if (lower.includes('overview') || lower.includes('purpose') || lower.includes('why') || lower.includes('important')) {
    return 'overview';
  }
  return 'tips';
}

/**
 * Extract knowledge points from snapshot insights
 */
async function extractKnowledgePointsFromSnapshot(interviewId, interview, extractedData) {
  const { keyInsights = [], frameworksMentioned = [] } = extractedData;
  const currentTopicId = interview.currentTopicId || 'general';
  let created = 0;

  const existingDir = path.join('./data', 'knowledge-points', interviewId);
  const existingPoints = [];
  if (fs.existsSync(existingDir)) {
    const files = fs.readdirSync(existingDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const point = dal.readData(`knowledge-points/${interviewId}/${file.replace('.json', '')}`);
      if (point) existingPoints.push(point.content.toLowerCase());
    }
  }

  const isDuplicate = (content) => {
    const normalized = content.toLowerCase().trim();
    return existingPoints.some(existing =>
      existing.includes(normalized) || normalized.includes(existing) ||
      levenshteinSimilarity(existing, normalized) > 0.8
    );
  };

  for (const insight of keyInsights) {
    if (!insight || insight.length < 10) continue;
    if (isDuplicate(insight)) continue;

    const area = categorizeInsight(insight);
    const pointId = 'kp_' + Math.random().toString(36).substring(2, 10);
    const point = {
      id: pointId,
      interviewId,
      topicId: currentTopicId,
      area,
      content: insight.trim(),
      source: 'snapshot',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dal.writeData(`knowledge-points/${interviewId}/${pointId}`, point);
    existingPoints.push(insight.toLowerCase());
    created++;
  }

  for (const framework of frameworksMentioned) {
    if (!framework || framework.length < 5) continue;
    if (isDuplicate(framework)) continue;

    const pointId = 'kp_' + Math.random().toString(36).substring(2, 10);
    const point = {
      id: pointId,
      interviewId,
      topicId: currentTopicId,
      area: 'tasks',
      content: `Framework: ${framework.trim()}`,
      source: 'snapshot',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dal.writeData(`knowledge-points/${interviewId}/${pointId}`, point);
    existingPoints.push(framework.toLowerCase());
    created++;
  }

  if (created > 0) {
    console.log(`Auto-extracted ${created} knowledge points for interview ${interviewId}`);
  }

  return created;
}

/**
 * Create a knowledge snapshot for an interview
 */
async function createSnapshot(interviewId) {
  try {
    const interview = dal.readData(`interviews/${interviewId}`);
    if (!interview || interview.messages.length === 0) {
      return null;
    }

    const systemPrompt = noteTaker.getSystemPrompt();
    const transcript = interview.messages
      .map((msg) => {
        const speaker = msg.role === 'user' ? 'Expert' : 'Interviewer';
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');

    const llmMessages = [{ role: 'user', content: transcript }];
    const llmResponse = await llm.chat(systemPrompt, llmMessages);
    const extractedData = noteTaker.parseResponse(llmResponse);

    const snapshotId = generateId();
    const snapshot = {
      id: snapshotId,
      interviewId,
      phase: interview.phase,
      messageCount: interview.messages.length,
      timestamp: new Date().toISOString(),
      ...extractedData,
    };

    dal.writeData(`snapshots/${interviewId}/${snapshotId}`, snapshot);
    console.log(`Auto-snapshot created: ${snapshotId} for interview ${interviewId}`);

    const knowledgePointsCreated = await extractKnowledgePointsFromSnapshot(interviewId, interview, extractedData);
    snapshot.knowledgePointsCreated = knowledgePointsCreated;

    return snapshot;
  } catch (error) {
    console.error(`Error creating auto-snapshot for ${interviewId}:`, error.message);
    return null;
  }
}

module.exports = {
  SNAPSHOT_INTERVAL,
  BCRYPT_ROUNDS,
  JWT_SECRET,
  TOKEN_EXPIRY,
  generateToken,
  verifyToken,
  extractToken,
  authMiddleware,
  optionalAuthMiddleware,
  listDataDir,
  generateId,
  levenshteinSimilarity,
  categorizeInsight,
  extractKnowledgePointsFromSnapshot,
  createSnapshot
};

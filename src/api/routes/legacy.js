/**
 * Legacy routes - contains all pre-refactor endpoints
 * These will be gradually migrated to proper route modules
 */
const express = require('express');
const router = express.Router();
const dal = require('../../dal/dal');
const llm = require('../../services/llm');
const interviewer = require('../../agents/interviewer');
const noteTaker = require('../../agents/note-taker');
const personaBuilder = require('../../agents/persona-builder');
const knowledgeBuilder = require('../../agents/knowledge-builder');
const fs = require('fs');
const path = require('path');

// Configuration for auto-snapshot
const SNAPSHOT_INTERVAL = 5; // Create snapshot every N user messages

/**
 * Helper function to create a knowledge snapshot for an interview
 * Also auto-extracts knowledge points from insights (Story 5.3)
 * @param {string} interviewId - The interview ID
 * @returns {Promise<Object|null>} The created snapshot or null on error
 */
async function createSnapshot(interviewId) {
  try {
    const interview = dal.readData(`interviews/${interviewId}`);
    if (!interview || interview.messages.length === 0) {
      return null;
    }

    // Get note-taker system prompt
    const systemPrompt = noteTaker.getSystemPrompt();

    // Format messages as transcript
    const transcript = interview.messages
      .map((msg) => {
        const speaker = msg.role === 'user' ? 'Expert' : 'Interviewer';
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');

    // Call LLM to extract insights
    const llmMessages = [{ role: 'user', content: transcript }];
    const llmResponse = await llm.chat(systemPrompt, llmMessages);

    // Parse the JSON response
    const extractedData = noteTaker.parseResponse(llmResponse);

    // Create snapshot object
    const snapshotId = Math.random().toString(36).substring(2, 15);
    const snapshot = {
      id: snapshotId,
      interviewId,
      phase: interview.phase,
      messageCount: interview.messages.length,
      timestamp: new Date().toISOString(),
      ...extractedData,
    };

    // Store snapshot
    dal.writeData(`snapshots/${interviewId}/${snapshotId}`, snapshot);
    console.log(`Auto-snapshot created: ${snapshotId} for interview ${interviewId}`);

    // Story 5.3: Auto-extract knowledge points from insights
    const knowledgePointsCreated = await extractKnowledgePointsFromSnapshot(interviewId, interview, extractedData);
    snapshot.knowledgePointsCreated = knowledgePointsCreated;

    return snapshot;
  } catch (error) {
    console.error(`Error creating auto-snapshot for ${interviewId}:`, error.message);
    return null;
  }
}

/**
 * Story 5.3: Extract knowledge points from snapshot insights
 * Maps keyInsights and frameworksMentioned to structured knowledge points
 * @param {string} interviewId - The interview ID
 * @param {Object} interview - The interview object
 * @param {Object} extractedData - Data from note-taker (topicsCovered, keyInsights, etc.)
 * @returns {number} Number of knowledge points created
 */
async function extractKnowledgePointsFromSnapshot(interviewId, interview, extractedData) {
  const { keyInsights = [], frameworksMentioned = [] } = extractedData;
  const currentTopicId = interview.currentTopicId || 'general';
  let created = 0;

  // Get existing knowledge points to avoid duplicates
  const existingDir = path.join('./data', 'knowledge-points', interviewId);
  const existingPoints = [];
  if (fs.existsSync(existingDir)) {
    const files = fs.readdirSync(existingDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const point = dal.readData(`knowledge-points/${interviewId}/${file.replace('.json', '')}`);
      if (point) existingPoints.push(point.content.toLowerCase());
    }
  }

  // Helper to check if insight is a duplicate
  const isDuplicate = (content) => {
    const normalized = content.toLowerCase().trim();
    return existingPoints.some(existing =>
      existing.includes(normalized) || normalized.includes(existing) ||
      levenshteinSimilarity(existing, normalized) > 0.8
    );
  };

  // Simple Levenshtein similarity (0-1 score)
  const levenshteinSimilarity = (a, b) => {
    if (a === b) return 1;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    // Quick check: if length difference is too big, skip full calculation
    if ((longer.length - shorter.length) / longer.length > 0.5) return 0;
    // Check if one contains the other
    if (longer.includes(shorter)) return shorter.length / longer.length;
    return 0; // Skip full Levenshtein for performance
  };

  // Map insights to knowledge areas based on content
  const categorizeInsight = (insight) => {
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
    return 'tips'; // Default to tips
  };

  // Create knowledge points from insights
  for (const insight of keyInsights) {
    if (!insight || insight.length < 10) continue; // Skip very short insights
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

  // Create knowledge points from frameworks (categorize as 'tasks' or 'overview')
  for (const framework of frameworksMentioned) {
    if (!framework || framework.length < 5) continue;
    if (isDuplicate(framework)) continue;

    const pointId = 'kp_' + Math.random().toString(36).substring(2, 10);
    const point = {
      id: pointId,
      interviewId,
      topicId: currentTopicId,
      area: 'tasks', // Frameworks typically relate to processes/tasks
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
    console.log(`Story 5.3: Auto-extracted ${created} knowledge points for interview ${interviewId}`);
  }

  return created;
}

const VALID_ROLES = [
  'Finance Director',
  'Head of AP',
  'Head of AR',
  'Head of Treasury',
];

// Helper to list all files in a data directory
function listDataDir(subdir) {
  const dirPath = path.join('./data', subdir);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

// GET /dashboard/stats
router.get('/dashboard/stats', (req, res) => {
  try {
    const interviewIds = listDataDir('interviews');
    const personaIds = listDataDir('personas');
    const expertIds = listDataDir('experts');
    const topicIds = listDataDir('topics');

    // Count interviews by status
    let scheduledInterviews = 0;
    let activeInterviews = 0;
    let completedInterviews = 0;

    for (const id of interviewIds) {
      const interview = dal.readData(`interviews/${id}`);
      if (interview) {
        if (interview.phase === 'complete') {
          completedInterviews++;
        } else if (interview.messages && interview.messages.length > 0) {
          activeInterviews++;
        } else {
          scheduledInterviews++;
        }
      }
    }

    // Count personas by status (supports both old and new status values)
    const personasByStatus = { Draft: 0, Validated: 0, Deprecated: 0 };
    let favoritePersonas = 0;

    for (const id of personaIds) {
      const persona = dal.readData(`personas/${id}`);
      if (persona) {
        // Map old status values to new ones for backward compatibility
        let status = persona.status || 'Draft';
        if (status === 'draft') status = 'Draft';
        else if (status === 'active' || status === 'pending') status = 'Validated';
        else if (status === 'archived') status = 'Deprecated';

        if (personasByStatus[status] !== undefined) {
          personasByStatus[status]++;
        }
        if (persona.isFavorite) {
          favoritePersonas++;
        }
      }
    }

    // Count topics by status and frequency
    const topicsByStatus = { pending: 0, 'in-progress': 0, complete: 0 };
    const topicsByFrequency = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, annual: 0, 'ad-hoc': 0 };

    for (const id of topicIds) {
      const topic = dal.readData(`topics/${id}`);
      if (topic) {
        const status = topic.status || 'pending';
        if (topicsByStatus[status] !== undefined) {
          topicsByStatus[status]++;
        }
        const frequency = topic.frequency || 'ad-hoc';
        if (topicsByFrequency[frequency] !== undefined) {
          topicsByFrequency[frequency]++;
        }
      }
    }

    // Count snapshots (transcripts ready)
    let transcriptsReady = 0;
    const snapshotsDir = path.join('./data', 'snapshots');
    if (fs.existsSync(snapshotsDir)) {
      const interviewDirs = fs.readdirSync(snapshotsDir);
      transcriptsReady = interviewDirs.length;
    }

    res.json({
      // Interviews
      totalInterviews: interviewIds.length,
      scheduledInterviews,
      activeInterviews,
      completedInterviews,
      transcriptsReady,
      // Personas
      totalPersonas: personaIds.length,
      personasGenerated: personaIds.length, // Backward compatibility
      personasByStatus,
      favoritePersonas,
      // Experts
      totalExperts: expertIds.length,
      // Topics
      totalTopics: topicIds.length,
      topicsByStatus,
      topicsByFrequency,
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      error: 'Internal server error getting dashboard stats',
      details: error.message,
    });
  }
});

// Story 5.1: GET /roles/:role/checklist - Get topic checklist for a role
router.get('/roles/:role/checklist', (req, res) => {
  try {
    const { role } = req.params;

    // Get the checklist from the interviewer module
    const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[role];

    if (!checklist) {
      // Return list of valid roles if role not found
      const validRoles = Object.keys(interviewer.ROLE_TOPIC_CHECKLISTS);
      return res.status(404).json({
        error: `Role not found: ${role}`,
        validRoles,
      });
    }

    // Return the checklist with additional metadata
    res.json({
      role,
      description: checklist.description,
      topicCount: checklist.topics.length,
      topics: checklist.topics,
      processOrientedCount: checklist.topics.filter(t => t.isProcessOriented).length,
    });
  } catch (error) {
    console.error('Error getting role checklist:', error);
    res.status(500).json({
      error: 'Internal server error getting role checklist',
      details: error.message,
    });
  }
});

// GET /roles - List all roles with their checklists
router.get('/roles', (req, res) => {
  try {
    const roles = Object.keys(interviewer.ROLE_TOPIC_CHECKLISTS).map(role => {
      const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[role];
      return {
        role,
        description: checklist.description,
        topicCount: checklist.topics.length,
        processOrientedCount: checklist.topics.filter(t => t.isProcessOriented).length,
      };
    });

    res.json(roles);
  } catch (error) {
    console.error('Error listing roles:', error);
    res.status(500).json({
      error: 'Internal server error listing roles',
      details: error.message,
    });
  }
});

// GET /interviews - List all interviews
router.get('/interviews', (req, res) => {
  try {
    const { status: filterStatus, expertId, topicId, role, sortBy, sortOrder, page, limit } = req.query;
    const interviewIds = listDataDir('interviews');
    let interviews = [];

    for (const id of interviewIds) {
      const interview = dal.readData(`interviews/${id}`);
      if (interview) {
        // Determine status based on data
        let status = 'scheduled';
        if (interview.messages && interview.messages.length > 0) {
          status = 'in-progress';
        }
        if (interview.phase === 'complete') {
          status = 'completed';
        }

        interviews.push({
          id: interview.id,
          role: interview.role,
          phase: interview.phase,
          status,
          messageCount: interview.messages ? interview.messages.length : 0,
          createdAt: interview.createdAt,
          updatedAt: interview.updatedAt || interview.createdAt,
          // For UI compatibility with designs
          expertName: interview.expertName || 'Unknown Expert',
          industry: interview.industry || 'Finance & Banking',
          // New fields
          expertId: interview.expertId || null,
          topicId: interview.topicId || null,
          questions: interview.questions || [],
          questionsCompleted: interview.questionsCompleted || [],
        });
      }
    }

    // Apply filters
    if (filterStatus) {
      interviews = interviews.filter(i => i.status === filterStatus);
    }
    if (expertId) {
      interviews = interviews.filter(i => i.expertId === expertId);
    }
    if (topicId) {
      interviews = interviews.filter(i => i.topicId === topicId);
    }
    if (role) {
      interviews = interviews.filter(i => i.role === role);
    }

    // Sorting (default: createdAt descending)
    const validSortFields = ['createdAt', 'updatedAt', 'status', 'role', 'expertName', 'messageCount'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDesc = sortOrder !== 'asc';

    interviews.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle date fields
      if (sortField === 'createdAt' || sortField === 'updatedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      // Handle string fields
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDesc ? 1 : -1;
      if (aVal > bVal) return sortDesc ? -1 : 1;
      return 0;
    });

    // Pagination (optional - if page/limit not provided, return all)
    if (page || limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const totalInterviews = interviews.length;
      const totalPages = Math.ceil(totalInterviews / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedInterviews = interviews.slice(startIndex, endIndex);

      return res.json({
        interviews: paginatedInterviews,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalInterviews,
          limit: limitNum,
        },
      });
    }

    res.json(interviews);
  } catch (error) {
    console.error('Error listing interviews:', error);
    res.status(500).json({
      error: 'Internal server error listing interviews',
      details: error.message,
    });
  }
});

// GET /interviews/{id} - Get a single interview
router.get('/interviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const interview = dal.readData(`interviews/${id}`);

    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Determine status
    let status = 'scheduled';
    if (interview.messages && interview.messages.length > 0) {
      status = 'in-progress';
    }
    if (interview.phase === 'complete') {
      status = 'completed';
    }

    res.json({
      ...interview,
      status,
      expertName: interview.expertName || 'Unknown Expert',
      industry: interview.industry || 'Finance & Banking',
      // Ensure new fields have defaults for backward compatibility
      expertId: interview.expertId || null,
      topicId: interview.topicId || null,
      questions: interview.questions || [],
      questionsCompleted: interview.questionsCompleted || [],
    });
  } catch (error) {
    console.error('Error getting interview:', error);
    res.status(500).json({
      error: 'Internal server error getting interview',
      details: error.message,
    });
  }
});

// DELETE /interviews/:id - Delete an interview and its related data
router.delete('/interviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const interview = dal.readData(`interviews/${id}`);

    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Delete interview file
    const interviewPath = `./data/interviews/${id}.json`;
    if (fs.existsSync(interviewPath)) {
      fs.unlinkSync(interviewPath);
    }

    // Delete related snapshots
    const snapshotsDir = `./data/snapshots/${id}`;
    if (fs.existsSync(snapshotsDir)) {
      fs.rmSync(snapshotsDir, { recursive: true });
    }

    // Delete related knowledge points
    const kpDir = `./data/knowledge-points/${id}`;
    if (fs.existsSync(kpDir)) {
      fs.rmSync(kpDir, { recursive: true });
    }

    // Delete related workflows
    const workflowsDir = `./data/workflows/${id}`;
    if (fs.existsSync(workflowsDir)) {
      fs.rmSync(workflowsDir, { recursive: true });
    }

    console.log(`Deleted interview ${id} and related data`);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting interview:', error);
    res.status(500).json({
      error: 'Internal server error deleting interview',
      details: error.message,
    });
  }
});

const VALID_PERSONA_STATUSES = ['Draft', 'Validated', 'Deprecated'];

// Helper to get next version number for a role
function getNextVersionForRole(role) {
  const personaIds = listDataDir('personas');
  let maxVersion = 0;

  for (const id of personaIds) {
    const persona = dal.readData(`personas/${id}`);
    if (persona && persona.role === role) {
      const version = persona.version || 1;
      if (version > maxVersion) {
        maxVersion = version;
      }
    }
  }

  return maxVersion + 1;
}

// Helper to deprecate old validated personas for a role
function deprecateOldVersions(role, excludeId) {
  const personaIds = listDataDir('personas');

  for (const id of personaIds) {
    if (id === excludeId) continue;

    const persona = dal.readData(`personas/${id}`);
    if (persona && persona.role === role && persona.status === 'Validated') {
      persona.status = 'Deprecated';
      persona.updatedAt = new Date().toISOString();
      dal.writeData(`personas/${id}`, persona);
    }
  }
}

// Helper to normalize expertise array
function normalizeExpertise(expertise) {
  if (!expertise || !Array.isArray(expertise)) return [];
  return expertise.map(e => {
    if (typeof e === 'string') {
      return { domain: e, level: 3 }; // Default level for legacy string format
    }
    return {
      domain: e.domain || e,
      level: Math.min(5, Math.max(1, e.level || 3)),
    };
  });
}

// GET /personas - List all personas
router.get('/personas', (req, res) => {
  try {
    const { status: filterStatus, role: filterRole, industry, isFavorite, latestValidated, sortBy, sortOrder, page, limit } = req.query;
    const personaIds = listDataDir('personas');
    let personas = [];

    for (const id of personaIds) {
      const persona = dal.readData(`personas/${id}`);
      if (persona) {
        personas.push({
          id: persona.id,
          name: persona.name || persona.role,
          role: persona.role,
          version: persona.version || 1,
          organization: persona.organization || 'Organization',
          bio: persona.bio || persona.promptText?.substring(0, 150) + '...',
          photoUrl: persona.photoUrl || null,
          status: persona.status || 'Draft',
          validatedBy: persona.validatedBy || null,
          validatedAt: persona.validatedAt || null,
          traits: persona.traits || [],
          expertise: normalizeExpertise(persona.expertise),
          industry: persona.industry || 'Finance & Banking',
          yearsOfExperience: persona.yearsOfExperience || null,
          isFavorite: persona.isFavorite || false,
          viewedAt: persona.viewedAt || null,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt || null,
          interviewId: persona.interviewId,
        });
      }
    }

    // Apply filters
    if (filterStatus) {
      personas = personas.filter(p => p.status === filterStatus);
    }
    if (filterRole) {
      personas = personas.filter(p => p.role === filterRole);
    }
    if (industry) {
      personas = personas.filter(p => p.industry.toLowerCase().includes(industry.toLowerCase()));
    }
    if (isFavorite === 'true') {
      personas = personas.filter(p => p.isFavorite === true);
    }

    // Special filter: get only the latest validated persona per role
    if (latestValidated === 'true') {
      const validatedPersonas = personas.filter(p => p.status === 'Validated');
      const latestByRole = {};

      for (const p of validatedPersonas) {
        if (!latestByRole[p.role] || p.version > latestByRole[p.role].version) {
          latestByRole[p.role] = p;
        }
      }

      personas = Object.values(latestByRole);
    }

    // Sorting (default: role asc, then version desc)
    const validSortFields = ['createdAt', 'updatedAt', 'status', 'role', 'name', 'version', 'validatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : null;
    const sortDesc = sortOrder !== 'asc';

    if (sortField) {
      personas.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        // Handle date fields
        if (sortField === 'createdAt' || sortField === 'updatedAt' || sortField === 'validatedAt') {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        }
        // Handle string fields
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }

        if (aVal < bVal) return sortDesc ? 1 : -1;
        if (aVal > bVal) return sortDesc ? -1 : 1;
        return 0;
      });
    } else {
      // Default sort: by role, then by version descending
      personas.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role.localeCompare(b.role);
        }
        return b.version - a.version;
      });
    }

    // Pagination (optional - if page/limit not provided, return all)
    if (page || limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const totalPersonas = personas.length;
      const totalPages = Math.ceil(totalPersonas / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedPersonas = personas.slice(startIndex, endIndex);

      return res.json({
        personas: paginatedPersonas,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalPersonas,
          limit: limitNum,
        },
      });
    }

    res.json(personas);
  } catch (error) {
    console.error('Error listing personas:', error);
    res.status(500).json({
      error: 'Internal server error listing personas',
      details: error.message,
    });
  }
});

// POST /interviews/start
router.post('/interviews/start', (req, res) => {
  const { role, expertName, industry, description, topics, expertId, topicId, questions } = req.body || {};

  // Role validation is now optional when topicId is provided
  if (!topicId && (!role || !VALID_ROLES.includes(role))) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')} (or provide topicId)`,
    });
  }

  // If topicId provided, verify it exists
  if (topicId) {
    const topic = dal.readData(`topics/${topicId}`);
    if (!topic) {
      return res.status(400).json({
        error: `Topic not found: ${topicId}`,
      });
    }
  }

  // Normalize questions array with structured format
  let normalizedQuestions = [];
  if (questions && Array.isArray(questions)) {
    normalizedQuestions = questions.map((q, index) => ({
      id: q.id || Math.random().toString(36).substring(2, 10),
      text: q.text || q.title || q,
      order: q.order !== undefined ? q.order : index,
    }));
  } else if (topics && Array.isArray(topics)) {
    // Backward compatibility: convert topics to questions format
    normalizedQuestions = topics.map((t, index) => ({
      id: t.id || Math.random().toString(36).substring(2, 10),
      text: t.title || t.description || t,
      order: t.order !== undefined ? t.order : index,
    }));
  }

  const interviewId = Math.random().toString(36).substring(2, 15);

  // Story 5.2: Initialize topic progress from role checklist
  let topicProgress = null;
  let currentTopicId = null;
  if (role && interviewer.ROLE_TOPIC_CHECKLISTS[role]) {
    const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[role];
    topicProgress = {};
    checklist.topics.forEach((topic, index) => {
      topicProgress[topic.id] = {
        status: 'not-started',
        coveragePercent: 0,
        validated: false,
        discussedAt: null,
        knowledgePoints: []
      };
      // Set first topic as current
      if (index === 0) {
        currentTopicId = topic.id;
        topicProgress[topic.id].status = 'in-progress';
      }
    });
  }

  const interview = {
    id: interviewId,
    role: role || null,
    phase: 'warm-up',
    messages: [],
    questions: normalizedQuestions,
    questionsCompleted: [],
    topicProgress,
    currentTopicId,
    createdAt: new Date().toISOString(),
    ...(expertName && { expertName }),
    ...(industry && { industry }),
    ...(description && { description }),
    ...(expertId && { expertId }),
    ...(topicId && { topicId }),
  };

  dal.writeData(`interviews/${interviewId}`, interview);
  res.json(interview);
});

// PUT /interviews/{id} - Update an interview
router.put('/interviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { expertName, industry, phase, status, expertId, topicId, questions, questionsCompleted } = req.body;

    // Load existing interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Merge updates with existing data (don't replace messages)
    if (expertName !== undefined) interview.expertName = expertName;
    if (industry !== undefined) interview.industry = industry;
    if (phase !== undefined) interview.phase = phase;
    if (status !== undefined) interview.status = status;
    if (expertId !== undefined) interview.expertId = expertId;
    if (topicId !== undefined) interview.topicId = topicId;
    if (questions !== undefined) {
      interview.questions = questions.map((q, index) => ({
        id: q.id || Math.random().toString(36).substring(2, 10),
        text: q.text || q.title || q,
        order: q.order !== undefined ? q.order : index,
      }));
    }
    if (questionsCompleted !== undefined) interview.questionsCompleted = questionsCompleted;

    // Add updatedAt timestamp
    interview.updatedAt = new Date().toISOString();

    // Save updated interview
    dal.writeData(`interviews/${id}`, interview);

    // Return updated interview
    res.json(interview);
  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({
      error: 'Internal server error updating interview',
      details: error.message,
    });
  }
});

// POST /interviews/{id}/complete - Mark interview as complete
router.post('/interviews/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    // Load interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Update phase and add completedAt timestamp
    interview.phase = 'complete';
    interview.completedAt = new Date().toISOString();

    // Save updated interview
    dal.writeData(`interviews/${id}`, interview);

    // Trigger auto-snapshot asynchronously
    createSnapshot(id).catch(err => {
      console.error('Auto-snapshot on complete failed:', err.message);
    });

    // Return updated interview
    res.json(interview);
  } catch (error) {
    console.error('Error completing interview:', error);
    res.status(500).json({
      error: 'Internal server error completing interview',
      details: error.message,
    });
  }
});

// GET /interviews/{id}/transcript - Get formatted transcript
router.get('/interviews/:id/transcript', (req, res) => {
  try {
    const { id } = req.params;

    // Load interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Format messages as readable transcript
    const transcriptLines = interview.messages.map(msg => {
      const speaker = msg.role === 'user' ? 'Expert' : 'Interviewer';
      const timestamp = new Date(msg.timestamp).toLocaleString();
      return `[${timestamp}] ${speaker}: ${msg.content}`;
    });

    const transcript = transcriptLines.join('\n\n');

    // Calculate duration if we have messages
    let duration = 'N/A';
    if (interview.messages.length > 0) {
      const firstTimestamp = new Date(interview.messages[0].timestamp);
      const lastTimestamp = new Date(interview.messages[interview.messages.length - 1].timestamp);
      const durationMs = lastTimestamp - firstTimestamp;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      duration = `${minutes}m ${seconds}s`;
    }

    // Return formatted transcript
    res.json({
      transcript,
      messageCount: interview.messages.length,
      duration,
    });
  } catch (error) {
    console.error('Error generating transcript:', error);
    res.status(500).json({
      error: 'Internal server error generating transcript',
      details: error.message,
    });
  }
});

// POST /interviews/{id}/message
router.post('/interviews/:id/message', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // Validate request body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Message is required and must be a string.',
      });
    }

    // Load interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Check for "done with topic" command
    const donePatterns = [
      "i'm done", "im done", "that's everything", "thats everything",
      "let's move on", "lets move on", "nothing else", "that's all",
      "thats all", "we're done", "were done", "finished", "complete"
    ];
    const messageLower = message.toLowerCase();
    const isDoneCommand = donePatterns.some(p => messageLower.includes(p));

    // Add user message to messages array
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    interview.messages.push(userMessage);

    let systemPrompt;

    // Story 7.2: Use topic-aware interviewer if topicId is present
    if (interview.topicId) {
      const topic = dal.readData(`topics/${interview.topicId}`);
      if (topic) {
        // Analyse coverage from conversation so far
        const coverage = interviewer.analyseCoverage(interview.messages);

        // Store coverage in interview for tracking
        interview.coverage = coverage;

        // Get topic-aware system prompt
        systemPrompt = interviewer.getTopicSystemPrompt(
          topic,
          coverage,
          interview.messages.length
        );

        // If done command, add instruction to wrap up
        if (isDoneCommand) {
          systemPrompt += `\n\n## IMPORTANT: Expert is finishing this topic\nThe expert has indicated they want to finish this topic. Acknowledge their input, briefly summarise the key points captured, and confirm the topic is complete. Be warm and appreciative.`;
        }
      } else {
        // Topic not found, fall back to role-based
        systemPrompt = interviewer.getSystemPrompt(
          interview.role || 'Finance Director',
          interview.phase || 'warm-up'
        );
      }
    } else {
      // No topic, use role-based interviewer
      systemPrompt = interviewer.getSystemPrompt(
        interview.role,
        interview.phase
      );

      // Story 5.2: Add topic context from checklist if available
      if (interview.role && interview.currentTopicId && interview.topicProgress) {
        const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[interview.role];
        if (checklist) {
          const currentTopic = checklist.topics.find(t => t.id === interview.currentTopicId);
          if (currentTopic) {
            // Build topic progress summary
            const topicsSummary = checklist.topics.map(t => {
              const progress = interview.topicProgress[t.id];
              const status = progress?.status || 'not-started';
              const icon = status === 'complete' ? '✓' : status === 'in-progress' ? '→' : '○';
              return `${icon} ${t.name}`;
            }).join('\n');

            // Add topic guidance to system prompt
            systemPrompt += `\n\n## CURRENT TOPIC FOCUS
**Current Topic:** ${currentTopic.name}
**Topic Description:** ${currentTopic.description}
**Knowledge Areas to Cover:** ${currentTopic.requiredAreas.join(', ')}

## Topic Progress (${checklist.topics.filter(t => interview.topicProgress[t.id]?.status === 'complete').length}/${checklist.topics.length} complete)
${topicsSummary}

## Topic Guidance
- Focus your questions on "${currentTopic.name}" until it's well covered
- When you feel this topic is sufficiently explored, mention that you've "covered ${currentTopic.name} well" and ask if they want to move to the next topic
- If the expert mentions another topic from the list, acknowledge it and ask if they want to switch focus
- Don't rigidly stick to one topic if the expert naturally flows to related areas - follow their expertise`;
          }
        }
      }
    }

    // Call LLM service with system prompt and full message history
    const assistantContent = await llm.chat(systemPrompt, interview.messages);

    // Add assistant response to messages array
    const assistantMessage = {
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString(),
    };
    interview.messages.push(assistantMessage);

    // If done command detected, update topic status
    if (isDoneCommand && interview.topicId) {
      const topic = dal.readData(`topics/${interview.topicId}`);
      if (topic && topic.status !== 'complete') {
        topic.status = 'complete';
        topic.updatedAt = new Date().toISOString();
        dal.writeData(`topics/${interview.topicId}`, topic);
      }
    }

    // Save updated interview to DAL
    interview.updatedAt = new Date().toISOString();
    dal.writeData(`interviews/${id}`, interview);

    // Check if we should auto-trigger a snapshot
    const userMessageCount = interview.messages.filter(m => m.role === 'user').length;
    if (userMessageCount > 0 && userMessageCount % SNAPSHOT_INTERVAL === 0) {
      // Trigger snapshot asynchronously (don't block response)
      createSnapshot(id).catch(err => {
        console.error('Auto-snapshot failed:', err.message);
      });
    }

    // Story 2.4: Detect interview completion signals
    // Check both user input and interviewer response for completion indicators
    const completionPatterns = [
      "thank you so much for sharing",
      "thank you for sharing",
      "this has been very helpful",
      "that concludes",
      "we've covered a lot",
      "that's a great place to stop",
      "shall we finish",
      "ready to finish",
      "wrap up",
      "that covers everything"
    ];
    const responseToCheck = assistantContent.toLowerCase();
    const interviewerSignalingCompletion = completionPatterns.some(p => responseToCheck.includes(p));
    const completionDetected = isDoneCommand || interviewerSignalingCompletion;

    // If completion detected, trigger a snapshot to capture final state
    if (completionDetected) {
      createSnapshot(id).catch(err => {
        console.error('Completion snapshot failed:', err.message);
      });
    }

    // Return JSON response with assistant's message and coverage info
    const response = {
      response: assistantContent,
      ...(interview.coverage && { coverage: interview.coverage }),
      ...(isDoneCommand && { topicComplete: true }),
      ...(completionDetected && { completionDetected: true }),
    };
    res.json(response);
  } catch (error) {
    console.error('Error handling message:', error);
    res.status(500).json({
      error: 'Internal server error processing message',
      details: error.message,
    });
  }
});

// GET /interviews/{id}/coverage - Get knowledge area coverage for an interview
router.get('/interviews/:id/coverage', (req, res) => {
  try {
    const { id } = req.params;

    // Load interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Analyse coverage from conversation
    const coverage = interviewer.analyseCoverage(interview.messages);

    // Get knowledge area definitions
    const areas = interviewer.KNOWLEDGE_AREAS.map(area => ({
      key: area.key,
      name: area.name,
      description: area.prompt,
      covered: !!coverage[area.key],
    }));

    // Calculate summary
    const coveredCount = areas.filter(a => a.covered).length;
    const totalCount = areas.length;
    const percentComplete = Math.round((coveredCount / totalCount) * 100);

    res.json({
      interviewId: id,
      topicId: interview.topicId || null,
      messageCount: interview.messages?.length || 0,
      areas,
      summary: {
        covered: coveredCount,
        total: totalCount,
        percentComplete,
      },
    });
  } catch (error) {
    console.error('Error getting interview coverage:', error);
    res.status(500).json({
      error: 'Internal server error getting coverage',
      details: error.message,
    });
  }
});

// POST /interviews/{id}/note-snapshot
router.post('/interviews/:id/note-snapshot', async (req, res) => {
  try {
    const { id } = req.params;

    // Load interview from DAL
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${id}`,
      });
    }

    // Get note-taker system prompt
    const systemPrompt = noteTaker.getSystemPrompt();

    // Format recent messages as a transcript string for the LLM
    const transcript = interview.messages
      .map((msg) => {
        const speaker = msg.role === 'user' ? 'Candidate' : 'Interviewer';
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');

    // Call LLM to extract insights
    const llmMessages = [
      {
        role: 'user',
        content: transcript,
      },
    ];
    const llmResponse = await llm.chat(systemPrompt, llmMessages);

    // Parse the JSON response
    const extractedData = noteTaker.parseResponse(llmResponse);

    // Create snapshot object
    const snapshotId = Math.random().toString(36).substring(2, 15);
    const snapshot = {
      id: snapshotId,
      interviewId: id,
      phase: interview.phase,
      timestamp: new Date().toISOString(),
      ...extractedData,
    };

    // Store snapshot at snapshots/{interviewId}/{snapshotId}
    dal.writeData(`snapshots/${id}/${snapshotId}`, snapshot);

    // Return the snapshot
    res.json(snapshot);
  } catch (error) {
    console.error('Error creating note snapshot:', error);
    res.status(500).json({
      error: 'Internal server error creating note snapshot',
      details: error.message,
    });
  }
});

// GET /interviews/{id}/snapshots
router.get('/interviews/:id/snapshots', (req, res) => {
  try {
    const { id } = req.params;
    const snapshotsDir = path.join('./data', 'snapshots', id);

    // Check if snapshots directory exists
    if (!fs.existsSync(snapshotsDir)) {
      return res.json([]);
    }

    // List all snapshot files in the directory
    const files = fs.readdirSync(snapshotsDir);
    const snapshots = [];

    // Load and parse each snapshot file
    for (const file of files) {
      if (file.endsWith('.json')) {
        const snapshotId = file.replace('.json', '');
        const snapshot = dal.readData(`snapshots/${id}/${snapshotId}`);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
    }

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(snapshots);
  } catch (error) {
    console.error('Error retrieving snapshots:', error);
    res.status(500).json({
      error: 'Internal server error retrieving snapshots',
      details: error.message,
    });
  }
});

// Role-expected topics for coverage comparison (Story 2.4)
const ROLE_EXPECTED_TOPICS = {
  "Finance Director": [
    "Strategic financial planning",
    "Budget setting and monitoring",
    "MTFS development",
    "Reserves strategy",
    "Political engagement",
    "Section 151 responsibilities",
    "Risk management",
    "Year-end processes",
    "Audit preparation"
  ],
  "Head of AP": [
    "Invoice processing",
    "Supplier management",
    "Payment controls",
    "Fraud prevention",
    "BACS/payment runs",
    "Purchase order matching",
    "Month-end procedures",
    "VAT compliance",
    "System management"
  ],
  "Head of AR": [
    "Debt collection",
    "Invoicing processes",
    "Customer relationships",
    "Write-off procedures",
    "Aged debt management",
    "Payment plans",
    "Legal escalation",
    "Vulnerable customers",
    "Bad debt provisioning"
  ],
  "Head of Treasury": [
    "Daily cash flow management",
    "Investment strategy",
    "Borrowing/debt management",
    "Banking relationships",
    "Money Market Funds",
    "Regulatory compliance",
    "Risk management",
    "Year-end processes",
    "Treasury systems"
  ]
};

// GET /interviews/{id}/summary - Aggregate knowledge captured (Story 2.4)
router.get('/interviews/:id/summary', (req, res) => {
  try {
    const { id } = req.params;

    // Load interview
    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    // Load all snapshots for this interview
    const snapshotsDir = path.join('./data', 'snapshots', id);
    let snapshots = [];

    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const snapshotId = file.replace('.json', '');
          const snapshot = dal.readData(`snapshots/${id}/${snapshotId}`);
          if (snapshot) {
            snapshots.push(snapshot);
          }
        }
      }
      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Aggregate topics from all snapshots (deduplicated)
    const topicsSet = new Set();
    const insightsSet = new Set();
    const gapsSet = new Set();
    const frameworksSet = new Set();

    snapshots.forEach(snapshot => {
      (snapshot.topicsCovered || []).forEach(t => topicsSet.add(t));
      (snapshot.keyInsights || []).forEach(i => insightsSet.add(i));
      (snapshot.gaps || []).forEach(g => gapsSet.add(g));
      (snapshot.frameworksMentioned || []).forEach(f => frameworksSet.add(f));
    });

    const topicsCovered = Array.from(topicsSet);
    const keyInsights = Array.from(insightsSet);
    const gaps = Array.from(gapsSet);
    const frameworksMentioned = Array.from(frameworksSet);

    // Calculate duration
    let duration = null;
    if (interview.messages && interview.messages.length > 1) {
      const firstTimestamp = new Date(interview.messages[0].timestamp);
      const lastTimestamp = new Date(interview.messages[interview.messages.length - 1].timestamp);
      const durationMs = lastTimestamp - firstTimestamp;
      const minutes = Math.floor(durationMs / 60000);
      duration = minutes;
    }

    // Coverage comparison against role-expected topics
    const role = interview.role;
    const expectedTopics = ROLE_EXPECTED_TOPICS[role] || [];

    // Simple matching: check if any captured topic contains expected topic keywords
    const coveredExpected = expectedTopics.filter(expected => {
      const expectedLower = expected.toLowerCase();
      return topicsCovered.some(captured => {
        const capturedLower = captured.toLowerCase();
        // Check for keyword overlap
        const expectedWords = expectedLower.split(/\s+/);
        return expectedWords.some(word => word.length > 3 && capturedLower.includes(word));
      });
    });

    const uncoveredExpected = expectedTopics.filter(t => !coveredExpected.includes(t));

    // Calculate coverage depth
    let coverageDepth = 'shallow';
    const coveragePercent = expectedTopics.length > 0
      ? (coveredExpected.length / expectedTopics.length) * 100
      : 0;

    if (coveragePercent >= 70) coverageDepth = 'deep';
    else if (coveragePercent >= 40) coverageDepth = 'moderate';

    res.json({
      interviewId: id,
      role: interview.role,
      phase: interview.phase,
      messageCount: interview.messages?.length || 0,
      snapshotCount: snapshots.length,
      duration,
      topicsCovered,
      keyInsights,
      gaps,
      frameworksMentioned,
      coverage: {
        expectedTopics,
        coveredExpected,
        uncoveredExpected,
        percent: Math.round(coveragePercent),
        depth: coverageDepth
      },
      createdAt: interview.createdAt,
      updatedAt: interview.updatedAt
    });
  } catch (error) {
    console.error('Error generating interview summary:', error);
    res.status(500).json({
      error: 'Internal server error generating summary',
      details: error.message,
    });
  }
});

// POST /interviews/{id}/initialize-topics - Initialize topic tracking for an existing interview
router.post('/interviews/:id/initialize-topics', (req, res) => {
  try {
    const { id } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    if (!interview.role) {
      return res.status(400).json({ error: 'Interview has no role assigned' });
    }

    // Get the checklist for this role
    const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[interview.role];
    if (!checklist) {
      return res.status(400).json({ error: `No checklist found for role: ${interview.role}` });
    }

    // Initialize topicProgress if not exists
    if (!interview.topicProgress) {
      interview.topicProgress = {};
      for (const topic of checklist.topics) {
        interview.topicProgress[topic.id] = {
          status: 'not-started',
          coveragePercent: 0,
          validated: false,
          hasWorkflow: false
        };
      }
      // Set first topic as current
      interview.currentTopicId = checklist.topics[0]?.id || null;
    }

    interview.updatedAt = new Date().toISOString();
    dal.writeData(`interviews/${id}`, interview);

    res.json({
      success: true,
      message: `Initialized ${checklist.topics.length} topics for ${interview.role}`,
      topicCount: checklist.topics.length
    });
  } catch (error) {
    console.error('Error initializing topics:', error);
    res.status(500).json({
      error: 'Internal server error initializing topics',
      details: error.message,
    });
  }
});

// Story 5.2: GET /interviews/{id}/topic-progress - Get topic progress for an interview
router.get('/interviews/:id/topic-progress', (req, res) => {
  try {
    const { id } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    if (!interview.role || !interview.topicProgress) {
      return res.status(400).json({
        error: 'Interview does not have topic tracking enabled',
        hint: 'Topic tracking is only available for role-based interviews'
      });
    }

    // Get the checklist for this role
    const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[interview.role];
    if (!checklist) {
      return res.status(400).json({ error: `No checklist found for role: ${interview.role}` });
    }

    // Build enriched topic progress with names and descriptions
    const topics = checklist.topics.map(topic => ({
      ...topic,
      progress: interview.topicProgress[topic.id] || {
        status: 'not-started',
        coveragePercent: 0,
        validated: false
      },
      isCurrent: interview.currentTopicId === topic.id
    }));

    // Calculate overall progress
    const completedCount = topics.filter(t => t.progress.status === 'complete').length;
    const inProgressCount = topics.filter(t => t.progress.status === 'in-progress').length;
    const totalPercent = Math.round(
      topics.reduce((sum, t) => sum + (t.progress.coveragePercent || 0), 0) / topics.length
    );

    res.json({
      interviewId: id,
      role: interview.role,
      currentTopicId: interview.currentTopicId,
      topics,
      summary: {
        total: topics.length,
        completed: completedCount,
        inProgress: inProgressCount,
        notStarted: topics.length - completedCount - inProgressCount,
        overallPercent: totalPercent,
        meetsThreshold: totalPercent >= 70
      }
    });
  } catch (error) {
    console.error('Error getting topic progress:', error);
    res.status(500).json({
      error: 'Internal server error getting topic progress',
      details: error.message,
    });
  }
});

// Story 5.2: POST /interviews/{id}/topic/{topicId}/select - Set current topic
router.post('/interviews/:id/topic/:topicId/select', (req, res) => {
  try {
    const { id, topicId } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    if (!interview.topicProgress || !interview.topicProgress[topicId]) {
      return res.status(400).json({ error: `Topic not found in interview: ${topicId}` });
    }

    // Update current topic
    const previousTopicId = interview.currentTopicId;
    interview.currentTopicId = topicId;

    // Mark new topic as in-progress if it was not-started
    if (interview.topicProgress[topicId].status === 'not-started') {
      interview.topicProgress[topicId].status = 'in-progress';
      interview.topicProgress[topicId].discussedAt = new Date().toISOString();
    }

    interview.updatedAt = new Date().toISOString();
    dal.writeData(`interviews/${id}`, interview);

    res.json({
      success: true,
      previousTopicId,
      currentTopicId: topicId,
      topicProgress: interview.topicProgress[topicId]
    });
  } catch (error) {
    console.error('Error selecting topic:', error);
    res.status(500).json({
      error: 'Internal server error selecting topic',
      details: error.message,
    });
  }
});

// Story 5.2: POST /interviews/{id}/topic/{topicId}/complete - Mark topic as complete
router.post('/interviews/:id/topic/:topicId/complete', (req, res) => {
  try {
    const { id, topicId } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    if (!interview.topicProgress || !interview.topicProgress[topicId]) {
      return res.status(400).json({ error: `Topic not found in interview: ${topicId}` });
    }

    // Mark topic as complete
    interview.topicProgress[topicId].status = 'complete';
    interview.topicProgress[topicId].completedAt = new Date().toISOString();

    // If this was the current topic, move to next uncompleted topic
    if (interview.currentTopicId === topicId) {
      const checklist = interviewer.ROLE_TOPIC_CHECKLISTS[interview.role];
      if (checklist) {
        const nextTopic = checklist.topics.find(t =>
          interview.topicProgress[t.id]?.status !== 'complete' && t.id !== topicId
        );
        if (nextTopic) {
          interview.currentTopicId = nextTopic.id;
          if (interview.topicProgress[nextTopic.id].status === 'not-started') {
            interview.topicProgress[nextTopic.id].status = 'in-progress';
            interview.topicProgress[nextTopic.id].discussedAt = new Date().toISOString();
          }
        }
      }
    }

    interview.updatedAt = new Date().toISOString();
    dal.writeData(`interviews/${id}`, interview);

    res.json({
      success: true,
      topicId,
      newCurrentTopicId: interview.currentTopicId,
      topicProgress: interview.topicProgress
    });
  } catch (error) {
    console.error('Error completing topic:', error);
    res.status(500).json({
      error: 'Internal server error completing topic',
      details: error.message,
    });
  }
});

// ============================================
// KNOWLEDGE POINTS ENDPOINTS (Story 5.3)
// ============================================

const VALID_KNOWLEDGE_POINT_STATUSES = ['draft', 'reviewed', 'approved'];
const VALID_KNOWLEDGE_AREAS = ['overview', 'tasks', 'dates', 'contacts', 'systems', 'pitfalls', 'tips', 'related'];

// Helper to list knowledge points for an interview
function listKnowledgePoints(interviewId) {
  const dirPath = path.join('./data', 'knowledge-points', interviewId);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const id = f.replace('.json', '');
      return dal.readData(`knowledge-points/${interviewId}/${id}`);
    })
    .filter(Boolean);
}

// GET /interviews/:id/knowledge-points - Get all knowledge points organized by topic
router.get('/interviews/:id/knowledge-points', (req, res) => {
  try {
    const { id } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    // Get all knowledge points for this interview
    const points = listKnowledgePoints(id);

    // Get topic checklist if available
    const checklist = interview.role ? interviewer.ROLE_TOPIC_CHECKLISTS[interview.role] : null;
    const topicMap = {};

    // Initialize topics from checklist
    if (checklist) {
      for (const topic of checklist.topics) {
        topicMap[topic.id] = {
          id: topic.id,
          name: topic.name,
          description: topic.description,
          requiredAreas: topic.requiredAreas || VALID_KNOWLEDGE_AREAS,
          validationStatus: interview.topicProgress?.[topic.id]?.validationStatus || 'draft',
          areas: {}
        };
        // Initialize all areas
        for (const area of (topic.requiredAreas || VALID_KNOWLEDGE_AREAS)) {
          topicMap[topic.id].areas[area] = [];
        }
      }
    }

    // Also handle points for topics not in checklist (e.g., "general")
    for (const point of points) {
      const topicId = point.topicId || 'general';
      if (!topicMap[topicId]) {
        topicMap[topicId] = {
          id: topicId,
          name: topicId === 'general' ? 'General Knowledge' : topicId,
          description: 'Knowledge points not tied to a specific topic',
          requiredAreas: VALID_KNOWLEDGE_AREAS,
          validationStatus: 'draft',
          areas: {}
        };
        for (const area of VALID_KNOWLEDGE_AREAS) {
          topicMap[topicId].areas[area] = [];
        }
      }
      const area = point.area || 'tips';
      if (!topicMap[topicId].areas[area]) {
        topicMap[topicId].areas[area] = [];
      }
      topicMap[topicId].areas[area].push(point);
    }

    // Calculate stats
    const totalPoints = points.length;
    const approvedPoints = points.filter(p => p.status === 'approved').length;
    const reviewedPoints = points.filter(p => p.status === 'reviewed').length;

    res.json({
      interviewId: id,
      role: interview.role,
      topics: Object.values(topicMap),
      summary: {
        totalPoints,
        approvedPoints,
        reviewedPoints,
        draftPoints: totalPoints - approvedPoints - reviewedPoints
      }
    });
  } catch (error) {
    console.error('Error getting knowledge points:', error);
    res.status(500).json({
      error: 'Internal server error getting knowledge points',
      details: error.message,
    });
  }
});

// POST /interviews/:id/knowledge-points - Add a new knowledge point
router.post('/interviews/:id/knowledge-points', (req, res) => {
  try {
    const { id } = req.params;
    const { topicId, area, content } = req.body;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    // Validate area
    if (area && !VALID_KNOWLEDGE_AREAS.includes(area)) {
      return res.status(400).json({
        error: `Invalid area. Must be one of: ${VALID_KNOWLEDGE_AREAS.join(', ')}`
      });
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }

    // Create knowledge point
    const pointId = 'kp_' + Math.random().toString(36).substring(2, 10);
    const point = {
      id: pointId,
      interviewId: id,
      topicId: topicId || 'general',
      area: area || 'tips',
      content: content.trim(),
      source: 'manual',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store knowledge point
    dal.writeData(`knowledge-points/${id}/${pointId}`, point);

    res.status(201).json(point);
  } catch (error) {
    console.error('Error creating knowledge point:', error);
    res.status(500).json({
      error: 'Internal server error creating knowledge point',
      details: error.message,
    });
  }
});

// PUT /knowledge-points/:interviewId/:pointId - Edit a knowledge point
router.put('/knowledge-points/:interviewId/:pointId', (req, res) => {
  try {
    const { interviewId, pointId } = req.params;
    const { content, area, status, topicId } = req.body;

    const point = dal.readData(`knowledge-points/${interviewId}/${pointId}`);
    if (!point) {
      return res.status(404).json({ error: `Knowledge point not found: ${pointId}` });
    }

    // Validate area if provided
    if (area !== undefined && !VALID_KNOWLEDGE_AREAS.includes(area)) {
      return res.status(400).json({
        error: `Invalid area. Must be one of: ${VALID_KNOWLEDGE_AREAS.join(', ')}`
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_KNOWLEDGE_POINT_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_KNOWLEDGE_POINT_STATUSES.join(', ')}`
      });
    }

    // Update fields
    if (content !== undefined) point.content = content.trim();
    if (area !== undefined) point.area = area;
    if (status !== undefined) point.status = status;
    if (topicId !== undefined) point.topicId = topicId;
    point.updatedAt = new Date().toISOString();

    dal.writeData(`knowledge-points/${interviewId}/${pointId}`, point);

    res.json(point);
  } catch (error) {
    console.error('Error updating knowledge point:', error);
    res.status(500).json({
      error: 'Internal server error updating knowledge point',
      details: error.message,
    });
  }
});

// DELETE /knowledge-points/:interviewId/:pointId - Delete a knowledge point
router.delete('/knowledge-points/:interviewId/:pointId', (req, res) => {
  try {
    const { interviewId, pointId } = req.params;

    const point = dal.readData(`knowledge-points/${interviewId}/${pointId}`);
    if (!point) {
      return res.status(404).json({ error: `Knowledge point not found: ${pointId}` });
    }

    // Delete the file
    const filePath = `./data/knowledge-points/${interviewId}/${pointId}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting knowledge point:', error);
    res.status(500).json({
      error: 'Internal server error deleting knowledge point',
      details: error.message,
    });
  }
});

// POST /interviews/:id/topics/:topicId/validate - Mark topic as validated
router.post('/interviews/:id/topics/:topicId/validate', (req, res) => {
  try {
    const { id, topicId } = req.params;
    const { validationStatus } = req.body;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    if (!interview.topicProgress) {
      return res.status(400).json({ error: 'Interview does not have topic tracking enabled' });
    }

    if (!interview.topicProgress[topicId]) {
      return res.status(404).json({ error: `Topic not found: ${topicId}` });
    }

    // Validate status
    const validStatuses = ['draft', 'reviewed', 'approved'];
    if (!validStatuses.includes(validationStatus)) {
      return res.status(400).json({
        error: `Invalid validationStatus. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update topic validation status
    interview.topicProgress[topicId].validationStatus = validationStatus;
    interview.topicProgress[topicId].validatedAt = new Date().toISOString();
    interview.updatedAt = new Date().toISOString();

    dal.writeData(`interviews/${id}`, interview);

    res.json({
      success: true,
      topicId,
      validationStatus,
      topicProgress: interview.topicProgress[topicId]
    });
  } catch (error) {
    console.error('Error validating topic:', error);
    res.status(500).json({
      error: 'Internal server error validating topic',
      details: error.message,
    });
  }
});

// ============================================
// WORKFLOW DIAGRAM ENDPOINTS (Story 5.4)
// ============================================

const WORKFLOW_SYSTEM_PROMPT = `You are an expert at analyzing interview transcripts and extracting workflow processes.

Your task is to:
1. Analyze the transcript for process/workflow steps
2. Identify the key stages, decision points, and outcomes
3. Generate a Mermaid flowchart diagram

Rules for the Mermaid diagram:
- Use 'flowchart TD' for top-down flow
- Use descriptive node IDs (A, B, C, etc.)
- Use square brackets [text] for regular steps
- Use curly braces {text} for decision points
- Use arrows --> for connections
- Add edge labels with |text| for decision outcomes
- Keep node text concise (under 40 characters)
- Include 3-10 steps typically
- Start with a clear beginning step and end with completion/outcomes

Example output format:
\`\`\`mermaid
flowchart TD
    A[Start: Receive Invoice] --> B[Validate Invoice Details]
    B --> C{Details Correct?}
    C -->|Yes| D[Code to GL Account]
    C -->|No| E[Return to Supplier]
    D --> F[Submit for Approval]
    F --> G{Approved?}
    G -->|Yes| H[Schedule Payment]
    G -->|No| I[Review with Manager]
    I --> F
    H --> J[Complete]
\`\`\`

Respond with ONLY the mermaid code block, nothing else.`;

// POST /interviews/:id/topics/:topicId/workflow - Generate workflow diagram
router.post('/interviews/:id/topics/:topicId/workflow', async (req, res) => {
  try {
    const { id, topicId } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    // Check if topic exists and is process-oriented
    const checklist = interview.role ? interviewer.ROLE_TOPIC_CHECKLISTS[interview.role] : null;
    if (!checklist) {
      return res.status(400).json({ error: 'Interview role not found in topic checklists' });
    }

    const topic = checklist.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: `Topic not found: ${topicId}` });
    }

    if (!topic.isProcessOriented) {
      return res.status(400).json({
        error: `Topic "${topic.name}" is not process-oriented. Workflow diagrams are only available for process-oriented topics.`
      });
    }

    // Extract relevant transcript content
    // Get messages that might be related to this topic
    const transcript = interview.messages
      .map((msg, idx) => {
        const speaker = msg.role === 'user' ? 'Expert' : 'Interviewer';
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');

    // Build prompt for LLM
    const userPrompt = `Analyze this interview transcript about "${topic.name}" (${topic.description}) and extract the workflow process.

Interview Transcript:
${transcript}

Generate a Mermaid flowchart diagram showing the key process steps, decision points, and outcomes for ${topic.name}.`;

    // Call LLM to generate workflow
    const llmMessages = [{ role: 'user', content: userPrompt }];
    const llmResponse = await llm.chat(WORKFLOW_SYSTEM_PROMPT, llmMessages);

    // Extract mermaid code from response
    let mermaidCode = llmResponse.trim();

    // Remove markdown code fences if present
    if (mermaidCode.startsWith('```mermaid')) {
      mermaidCode = mermaidCode.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '');
    } else if (mermaidCode.startsWith('```')) {
      mermaidCode = mermaidCode.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    // Sanitize mermaid code - wrap node text containing special chars in quotes
    // Match [text] and {text} patterns and quote if they contain ( ) or other special chars
    mermaidCode = mermaidCode.replace(/\[([^\]]+)\]/g, (match, text) => {
      if (/[(){}]/.test(text) && !text.startsWith('"')) {
        return `["${text.replace(/"/g, "'")}"]`;
      }
      return match;
    });
    mermaidCode = mermaidCode.replace(/\{([^}]+)\}/g, (match, text) => {
      if (/[()[\]]/.test(text) && !text.startsWith('"')) {
        return `{"${text.replace(/"/g, "'")}"}`;
      }
      return match;
    });

    // Create workflow entry
    const workflowId = 'wf_' + Math.random().toString(36).substring(2, 10);
    const workflow = {
      id: workflowId,
      interviewId: id,
      topicId,
      topicName: topic.name,
      mermaidCode,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store workflow
    dal.writeData(`workflows/${id}/${workflowId}`, workflow);

    // Update topic progress to indicate workflow exists
    if (interview.topicProgress && interview.topicProgress[topicId]) {
      interview.topicProgress[topicId].hasWorkflow = true;
      interview.topicProgress[topicId].workflowId = workflowId;
      dal.writeData(`interviews/${id}`, interview);
    }

    console.log(`Story 5.4: Generated workflow diagram for topic ${topicId} in interview ${id}`);

    res.json(workflow);
  } catch (error) {
    console.error('Error generating workflow:', error);
    res.status(500).json({
      error: 'Internal server error generating workflow',
      details: error.message,
    });
  }
});

// GET /interviews/:id/workflows - Get all workflows for an interview
router.get('/interviews/:id/workflows', (req, res) => {
  try {
    const { id } = req.params;

    const interview = dal.readData(`interviews/${id}`);
    if (!interview) {
      return res.status(404).json({ error: `Interview not found: ${id}` });
    }

    // List all workflows for this interview
    const workflowsDir = path.join('./data', 'workflows', id);
    const workflows = [];

    if (fs.existsSync(workflowsDir)) {
      const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const workflowId = file.replace('.json', '');
        const workflow = dal.readData(`workflows/${id}/${workflowId}`);
        if (workflow) {
          workflows.push(workflow);
        }
      }
    }

    res.json(workflows);
  } catch (error) {
    console.error('Error listing workflows:', error);
    res.status(500).json({
      error: 'Internal server error listing workflows',
      details: error.message,
    });
  }
});

// GET /workflows/:interviewId/:workflowId - Get a specific workflow
router.get('/workflows/:interviewId/:workflowId', (req, res) => {
  try {
    const { interviewId, workflowId } = req.params;

    const workflow = dal.readData(`workflows/${interviewId}/${workflowId}`);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${workflowId}` });
    }

    res.json(workflow);
  } catch (error) {
    console.error('Error getting workflow:', error);
    res.status(500).json({
      error: 'Internal server error getting workflow',
      details: error.message,
    });
  }
});

// PUT /workflows/:interviewId/:workflowId - Update workflow (edit mermaid code or status)
router.put('/workflows/:interviewId/:workflowId', (req, res) => {
  try {
    const { interviewId, workflowId } = req.params;
    const { mermaidCode, status } = req.body;

    const workflow = dal.readData(`workflows/${interviewId}/${workflowId}`);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${workflowId}` });
    }

    // Validate status if provided
    const validStatuses = ['draft', 'reviewed', 'approved'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update fields
    if (mermaidCode !== undefined) workflow.mermaidCode = mermaidCode;
    if (status !== undefined) workflow.status = status;
    workflow.updatedAt = new Date().toISOString();

    dal.writeData(`workflows/${interviewId}/${workflowId}`, workflow);

    res.json(workflow);
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({
      error: 'Internal server error updating workflow',
      details: error.message,
    });
  }
});

// DELETE /workflows/:interviewId/:workflowId - Delete a workflow
router.delete('/workflows/:interviewId/:workflowId', (req, res) => {
  try {
    const { interviewId, workflowId } = req.params;

    const workflow = dal.readData(`workflows/${interviewId}/${workflowId}`);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow not found: ${workflowId}` });
    }

    // Delete the file
    const filePath = `./data/workflows/${interviewId}/${workflowId}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Update interview topic progress
    const interview = dal.readData(`interviews/${interviewId}`);
    if (interview && interview.topicProgress && interview.topicProgress[workflow.topicId]) {
      interview.topicProgress[workflow.topicId].hasWorkflow = false;
      delete interview.topicProgress[workflow.topicId].workflowId;
      dal.writeData(`interviews/${interviewId}`, interview);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({
      error: 'Internal server error deleting workflow',
      details: error.message,
    });
  }
});

// POST /personas/build
router.post('/personas/build', async (req, res) => {
  try {
    const { interviewId } = req.body;

    // Validate request body
    if (!interviewId || typeof interviewId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. interviewId is required and must be a string.',
      });
    }

    // Load interview from DAL
    const interview = dal.readData(`interviews/${interviewId}`);
    if (!interview) {
      return res.status(404).json({
        error: `Interview not found: ${interviewId}`,
      });
    }

    // Load all snapshots for the interview
    const snapshotsDir = path.join('./data', 'snapshots', interviewId);
    const snapshots = [];

    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const snapshotId = file.replace('.json', '');
          const snapshot = dal.readData(`snapshots/${interviewId}/${snapshotId}`);
          if (snapshot) {
            snapshots.push(snapshot);
          }
        }
      }
      // Sort by timestamp (oldest first for chronological order)
      snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    // Format snapshots as input for the persona builder
    const snapshotsInput = JSON.stringify(snapshots, null, 2);

    // Get persona-builder system prompt
    const systemPrompt = personaBuilder.getSystemPrompt();

    // Call LLM with snapshots as input
    const llmMessages = [
      {
        role: 'user',
        content: snapshotsInput,
      },
    ];
    const promptText = await llm.chat(systemPrompt, llmMessages);

    // Create persona object with versioning
    const personaId = Math.random().toString(36).substring(2, 15);
    const version = getNextVersionForRole(interview.role);
    const persona = {
      id: personaId,
      role: interview.role,
      version,
      interviewId,
      promptText,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };

    // Store at personas/{personaId}
    dal.writeData(`personas/${personaId}`, persona);

    // Return the persona object
    res.json(persona);
  } catch (error) {
    console.error('Error building persona:', error);
    res.status(500).json({
      error: 'Internal server error building persona',
      details: error.message,
    });
  }
});

// GET /personas/{id}
router.get('/personas/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Load persona from DAL
    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Return the persona object with version and validation fields
    res.json({
      ...persona,
      version: persona.version || 1,
      status: persona.status || 'Draft',
      validatedBy: persona.validatedBy || null,
      validatedAt: persona.validatedAt || null,
    });
  } catch (error) {
    console.error('Error retrieving persona:', error);
    res.status(500).json({
      error: 'Internal server error retrieving persona',
      details: error.message,
    });
  }
});

// PUT /personas/{id} - Update a persona
router.put('/personas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, organization, yearsOfExperience, bio, photoUrl, traits, expertise, status, industry, isFavorite } = req.body;

    // Load existing persona from DAL
    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_PERSONA_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_PERSONA_STATUSES.join(', ')}`,
      });
    }

    // Track if we're validating this persona
    const isValidating = status === 'Validated' && persona.status !== 'Validated';

    // Merge updates with existing data
    if (name !== undefined) persona.name = name;
    if (role !== undefined) persona.role = role;
    if (organization !== undefined) persona.organization = organization;
    if (yearsOfExperience !== undefined) persona.yearsOfExperience = yearsOfExperience;
    if (bio !== undefined) persona.bio = bio;
    if (photoUrl !== undefined) persona.photoUrl = photoUrl;
    if (traits !== undefined) persona.traits = traits;
    if (expertise !== undefined) persona.expertise = normalizeExpertise(expertise);
    if (status !== undefined) persona.status = status;
    if (industry !== undefined) persona.industry = industry;
    if (isFavorite !== undefined) persona.isFavorite = isFavorite;

    // Ensure version is set (for legacy personas)
    if (!persona.version) {
      persona.version = 1;
    }

    // Add updatedAt timestamp
    persona.updatedAt = new Date().toISOString();

    // Save updated persona
    dal.writeData(`personas/${id}`, persona);

    // If validating, deprecate other validated personas for this role
    if (isValidating && persona.role) {
      deprecateOldVersions(persona.role, id);
    }

    // Return updated persona
    res.json({
      ...persona,
      version: persona.version || 1,
    });
  } catch (error) {
    console.error('Error updating persona:', error);
    res.status(500).json({
      error: 'Internal server error updating persona',
      details: error.message,
    });
  }
});

// DELETE /personas/:id - Delete a persona
router.delete('/personas/:id', (req, res) => {
  try {
    const { id } = req.params;

    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Delete the file
    const filePath = `./data/personas/${id}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted persona: ${id} (${persona.role})`);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting persona:', error);
    res.status(500).json({
      error: 'Internal server error deleting persona',
      details: error.message,
    });
  }
});

// DELETE /personas - Bulk delete personas
router.delete('/personas', (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'ids array is required in request body',
      });
    }

    const deleted = [];
    const notFound = [];

    for (const id of ids) {
      const persona = dal.readData(`personas/${id}`);
      if (!persona) {
        notFound.push(id);
        continue;
      }

      const filePath = `./data/personas/${id}.json`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted.push(id);
        console.log(`Bulk deleted persona: ${id}`);
      }
    }

    res.json({
      deleted,
      notFound,
      message: `Deleted ${deleted.length} persona(s)`,
    });
  } catch (error) {
    console.error('Error bulk deleting personas:', error);
    res.status(500).json({
      error: 'Internal server error bulk deleting personas',
      details: error.message,
    });
  }
});

// POST /personas/{id}/view - Record a view timestamp
router.post('/personas/:id/view', (req, res) => {
  try {
    const { id } = req.params;

    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    persona.viewedAt = new Date().toISOString();
    dal.writeData(`personas/${id}`, persona);

    res.json({ viewedAt: persona.viewedAt });
  } catch (error) {
    console.error('Error recording persona view:', error);
    res.status(500).json({
      error: 'Internal server error recording view',
      details: error.message,
    });
  }
});

// POST /personas/{id}/advise
router.post('/personas/:id/advise', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, userId } = req.body;

    // Validate request body
    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Question is required and must be a string.',
      });
    }

    // Load persona from DAL
    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Use persona's promptText as system prompt
    const systemPrompt = persona.promptText;

    // Send question to LLM
    const llmMessages = [
      {
        role: 'user',
        content: question,
      },
    ];
    const response = await llm.chat(systemPrompt, llmMessages);

    // Log the interaction (non-failing - don't block response if logging fails)
    try {
      const logId = Math.random().toString(36).substring(2, 15);
      const advisorLog = {
        logId,
        personaId: persona.id,
        personaVersion: persona.version || 1,
        userId: userId || null,
        question,
        response,
        createdAt: new Date().toISOString(),
      };
      dal.writeData(`advisor-logs/${logId}`, advisorLog);
    } catch (logError) {
      console.error('Failed to log advisor interaction:', logError.message);
      // Continue - logging failure should not block the response
    }

    // Return response
    res.json({
      response,
      personaId: persona.id,
      role: persona.role,
    });
  } catch (error) {
    console.error('Error handling advise request:', error);
    res.status(500).json({
      error: 'Internal server error handling advise request',
      details: error.message,
    });
  }
});

// POST /personas/{id}/feedback - Expert review and validation
router.post('/personas/:id/feedback', (req, res) => {
  try {
    const { id } = req.params;
    const { validatedBy, feedback } = req.body;

    // Validate request
    if (!validatedBy || typeof validatedBy !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. validatedBy is required and must be a string (email or identifier).',
      });
    }

    // Load persona
    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Check current status is Draft (validation only works from Draft)
    const currentStatus = persona.status || 'Draft';
    if (currentStatus !== 'Draft' && currentStatus !== 'draft') {
      return res.status(400).json({
        error: `Cannot validate persona. Current status is "${currentStatus}". Only Draft personas can be validated.`,
      });
    }

    // Get the original expert from the interview (for audit trail)
    let originalExpert = null;
    if (persona.interviewId) {
      const interview = dal.readData(`interviews/${persona.interviewId}`);
      if (interview && interview.expertId) {
        originalExpert = dal.readData(`experts/${interview.expertId}`);
      }
    }

    // Store feedback if provided
    if (feedback) {
      if (!persona.feedbackHistory) {
        persona.feedbackHistory = [];
      }
      persona.feedbackHistory.push({
        feedback,
        submittedBy: validatedBy,
        submittedAt: new Date().toISOString(),
      });
    }

    // Update persona status to Validated
    persona.status = 'Validated';
    persona.validatedBy = validatedBy;
    persona.validatedAt = new Date().toISOString();
    persona.updatedAt = persona.validatedAt;

    // Ensure version is set
    if (!persona.version) {
      persona.version = 1;
    }

    // Save updated persona
    dal.writeData(`personas/${id}`, persona);

    // Auto-deprecate other validated personas for this role
    if (persona.role) {
      deprecateOldVersions(persona.role, id);
    }

    // Return response matching spec
    res.json({
      status: persona.status,
      validatedAt: persona.validatedAt,
      validatedBy: persona.validatedBy,
      ...(originalExpert && { originalExpert: originalExpert.name }),
      ...(feedback && { feedbackRecorded: true }),
    });
  } catch (error) {
    console.error('Error processing persona feedback:', error);
    res.status(500).json({
      error: 'Internal server error processing feedback',
      details: error.message,
    });
  }
});

// ============================================
// TOPIC ENDPOINTS (Story 7.1)
// ============================================

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'ad-hoc'];
const VALID_TOPIC_STATUSES = ['pending', 'in-progress', 'complete'];

// GET /topics - List all topics
router.get('/topics', (req, res) => {
  try {
    const { status, frequency } = req.query;
    const topicIds = listDataDir('topics');
    let topics = [];

    for (const id of topicIds) {
      const topic = dal.readData(`topics/${id}`);
      if (topic) {
        topics.push(topic);
      }
    }

    // Apply filters
    if (status) {
      topics = topics.filter(t => t.status === status);
    }
    if (frequency) {
      topics = topics.filter(t => t.frequency === frequency);
    }

    // Sort by order (ascending), then by createdAt
    topics.sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    res.json(topics);
  } catch (error) {
    console.error('Error listing topics:', error);
    res.status(500).json({
      error: 'Internal server error listing topics',
      details: error.message,
    });
  }
});

// GET /topics/:id - Get a single topic
router.get('/topics/:id', (req, res) => {
  try {
    const { id } = req.params;
    const topic = dal.readData(`topics/${id}`);

    if (!topic) {
      return res.status(404).json({
        error: `Topic not found: ${id}`,
      });
    }

    res.json(topic);
  } catch (error) {
    console.error('Error getting topic:', error);
    res.status(500).json({
      error: 'Internal server error getting topic',
      details: error.message,
    });
  }
});

// POST /topics - Create a new topic
router.post('/topics', (req, res) => {
  try {
    const { name, description, frequency, order, category } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        error: 'Invalid request. Name is required and must be a non-empty string.',
      });
    }

    // Validate frequency if provided
    const topicFrequency = frequency || 'ad-hoc';
    if (!VALID_FREQUENCIES.includes(topicFrequency)) {
      return res.status(400).json({
        error: `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`,
      });
    }

    // Get next order if not provided
    let topicOrder = order;
    if (topicOrder === undefined) {
      const existingTopics = listDataDir('topics');
      topicOrder = existingTopics.length;
    }

    const topicId = Math.random().toString(36).substring(2, 15);
    const topic = {
      id: topicId,
      name: name.trim(),
      description: description || '',
      frequency: topicFrequency,
      category: category || '',
      order: topicOrder,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dal.writeData(`topics/${topicId}`, topic);
    res.status(201).json(topic);
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({
      error: 'Internal server error creating topic',
      details: error.message,
    });
  }
});

// PUT /topics/:id - Update a topic
router.put('/topics/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, frequency, order, status, category } = req.body;

    const topic = dal.readData(`topics/${id}`);
    if (!topic) {
      return res.status(404).json({
        error: `Topic not found: ${id}`,
      });
    }

    // Validate frequency if provided
    if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({
        error: `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`,
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_TOPIC_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_TOPIC_STATUSES.join(', ')}`,
      });
    }

    // Merge updates
    if (name !== undefined) topic.name = name.trim();
    if (description !== undefined) topic.description = description;
    if (frequency !== undefined) topic.frequency = frequency;
    if (category !== undefined) topic.category = category;
    if (order !== undefined) topic.order = order;
    if (status !== undefined) topic.status = status;
    topic.updatedAt = new Date().toISOString();

    dal.writeData(`topics/${id}`, topic);
    res.json(topic);
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({
      error: 'Internal server error updating topic',
      details: error.message,
    });
  }
});

// DELETE /topics/:id - Delete a topic
router.delete('/topics/:id', (req, res) => {
  try {
    const { id } = req.params;
    const topic = dal.readData(`topics/${id}`);

    if (!topic) {
      return res.status(404).json({
        error: `Topic not found: ${id}`,
      });
    }

    // Delete the file
    const filePath = `./data/topics/${id}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({
      error: 'Internal server error deleting topic',
      details: error.message,
    });
  }
});

// PUT /topics/reorder - Reorder all topics
router.put('/topics/reorder', (req, res) => {
  try {
    const { topicIds } = req.body;

    // Validate request
    if (!topicIds || !Array.isArray(topicIds)) {
      return res.status(400).json({
        error: 'Invalid request. topicIds must be an array of topic IDs.',
      });
    }

    // Update order for each topic
    const updatedTopics = [];
    for (let i = 0; i < topicIds.length; i++) {
      const topicId = topicIds[i];
      const topic = dal.readData(`topics/${topicId}`);

      if (topic) {
        topic.order = i;
        topic.updatedAt = new Date().toISOString();
        dal.writeData(`topics/${topicId}`, topic);
        updatedTopics.push(topic);
      }
    }

    res.json(updatedTopics);
  } catch (error) {
    console.error('Error reordering topics:', error);
    res.status(500).json({
      error: 'Internal server error reordering topics',
      details: error.message,
    });
  }
});

// ============================================
// KNOWLEDGE ENTRY ENDPOINTS (Story 7.3)
// ============================================

const VALID_KNOWLEDGE_ENTRY_STATUSES = ['draft', 'reviewed', 'published'];

// POST /topics/:id/synthesize - Generate knowledge entry from interview
router.post('/topics/:id/synthesize', async (req, res) => {
  try {
    const { id: topicId } = req.params;

    // Load topic
    const topic = dal.readData(`topics/${topicId}`);
    if (!topic) {
      return res.status(404).json({
        error: `Topic not found: ${topicId}`,
      });
    }

    // Find interview for this topic
    const interviewIds = listDataDir('interviews');
    let interview = null;

    for (const interviewId of interviewIds) {
      const i = dal.readData(`interviews/${interviewId}`);
      if (i && i.topicId === topicId) {
        interview = i;
        break;
      }
    }

    if (!interview) {
      return res.status(400).json({
        error: `No interview found for topic: ${topicId}`,
      });
    }

    if (!interview.messages || interview.messages.length === 0) {
      return res.status(400).json({
        error: 'Interview has no messages to synthesize',
      });
    }

    // Load all topics for cross-reference detection
    const allTopics = [];
    const allTopicIds = listDataDir('topics');
    for (const tid of allTopicIds) {
      const t = dal.readData(`topics/${tid}`);
      if (t) allTopics.push(t);
    }

    // Get system prompt with topic context
    const systemPrompt = knowledgeBuilder.getSystemPrompt(topic, allTopics);

    // Format transcript
    const transcript = knowledgeBuilder.formatTranscript(interview.messages);

    // Call LLM to synthesize
    const llmMessages = [{ role: 'user', content: transcript }];
    const llmResponse = await llm.chat(systemPrompt, llmMessages);

    // Parse and validate response
    const parsed = knowledgeBuilder.parseResponse(llmResponse);

    // Resolve cross-references to topic IDs
    const crossReferences = knowledgeBuilder.resolveCrossReferences(
      parsed.crossReferences,
      allTopics
    );

    // Create knowledge entry
    const entryId = Math.random().toString(36).substring(2, 15);
    const knowledgeEntry = {
      id: entryId,
      topicId,
      topicName: topic.name,
      interviewId: interview.id,
      sections: parsed.sections,
      crossReferences,
      qualityNotes: parsed.qualityNotes,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store knowledge entry
    dal.writeData(`knowledge-entries/${entryId}`, knowledgeEntry);

    // Update topic status to complete
    topic.status = 'complete';
    topic.knowledgeEntryId = entryId;
    topic.updatedAt = new Date().toISOString();
    dal.writeData(`topics/${topicId}`, topic);

    res.status(201).json(knowledgeEntry);
  } catch (error) {
    console.error('Error synthesizing knowledge entry:', error);
    res.status(500).json({
      error: 'Internal server error synthesizing knowledge entry',
      details: error.message,
    });
  }
});

// GET /knowledge-entries - List all knowledge entries
router.get('/knowledge-entries', (req, res) => {
  try {
    const { status, topicId } = req.query;
    const entryIds = listDataDir('knowledge-entries');
    let entries = [];

    for (const id of entryIds) {
      const entry = dal.readData(`knowledge-entries/${id}`);
      if (entry) {
        entries.push(entry);
      }
    }

    // Apply filters
    if (status) {
      entries = entries.filter(e => e.status === status);
    }
    if (topicId) {
      entries = entries.filter(e => e.topicId === topicId);
    }

    // Sort by createdAt (newest first)
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(entries);
  } catch (error) {
    console.error('Error listing knowledge entries:', error);
    res.status(500).json({
      error: 'Internal server error listing knowledge entries',
      details: error.message,
    });
  }
});

// GET /knowledge-entries/:id - Get a single knowledge entry
router.get('/knowledge-entries/:id', (req, res) => {
  try {
    const { id } = req.params;
    const entry = dal.readData(`knowledge-entries/${id}`);

    if (!entry) {
      return res.status(404).json({
        error: `Knowledge entry not found: ${id}`,
      });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error getting knowledge entry:', error);
    res.status(500).json({
      error: 'Internal server error getting knowledge entry',
      details: error.message,
    });
  }
});

// PUT /knowledge-entries/:id - Update a knowledge entry (for expert review/edit)
router.put('/knowledge-entries/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { sections, status, crossReferences, qualityNotes } = req.body;

    const entry = dal.readData(`knowledge-entries/${id}`);
    if (!entry) {
      return res.status(404).json({
        error: `Knowledge entry not found: ${id}`,
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_KNOWLEDGE_ENTRY_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_KNOWLEDGE_ENTRY_STATUSES.join(', ')}`,
      });
    }

    // Merge section updates (allow partial updates)
    if (sections !== undefined) {
      entry.sections = {
        ...entry.sections,
        ...sections,
      };
    }

    if (status !== undefined) entry.status = status;
    if (crossReferences !== undefined) entry.crossReferences = crossReferences;
    if (qualityNotes !== undefined) entry.qualityNotes = qualityNotes;

    entry.updatedAt = new Date().toISOString();

    dal.writeData(`knowledge-entries/${id}`, entry);
    res.json(entry);
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    res.status(500).json({
      error: 'Internal server error updating knowledge entry',
      details: error.message,
    });
  }
});

// DELETE /knowledge-entries/:id - Delete a knowledge entry
router.delete('/knowledge-entries/:id', (req, res) => {
  try {
    const { id } = req.params;
    const entry = dal.readData(`knowledge-entries/${id}`);

    if (!entry) {
      return res.status(404).json({
        error: `Knowledge entry not found: ${id}`,
      });
    }

    // Remove knowledgeEntryId from topic
    if (entry.topicId) {
      const topic = dal.readData(`topics/${entry.topicId}`);
      if (topic && topic.knowledgeEntryId === id) {
        delete topic.knowledgeEntryId;
        topic.updatedAt = new Date().toISOString();
        dal.writeData(`topics/${entry.topicId}`, topic);
      }
    }

    // Delete the file
    const filePath = `./data/knowledge-entries/${id}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    res.status(500).json({
      error: 'Internal server error deleting knowledge entry',
      details: error.message,
    });
  }
});

// ============================================
// QA SCENARIO ENDPOINTS (Story 5.1)
// ============================================

// Map role names to directory slugs
const ROLE_TO_SLUG = {
  'Finance Director': 'finance-director',
  'Head of AP': 'head-of-ap',
  'Head of AR': 'head-of-ar',
  'Head of Treasury': 'head-of-treasury',
};

// GET /qa/scenarios/:role - Get test scenarios for a role
router.get('/qa/scenarios/:role', (req, res) => {
  try {
    const { role } = req.params;

    // Decode URL-encoded role (e.g., "Finance%20Director" -> "Finance Director")
    const decodedRole = decodeURIComponent(role);

    // Get directory slug for role
    const slug = ROLE_TO_SLUG[decodedRole];
    if (!slug) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${Object.keys(ROLE_TO_SLUG).join(', ')}`,
      });
    }

    // List scenarios in the role directory
    const scenariosDir = path.join('./data', 'scenarios', slug);
    if (!fs.existsSync(scenariosDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(scenariosDir);
    const scenarios = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const scenarioId = file.replace('.json', '');
        const scenario = dal.readData(`scenarios/${slug}/${scenarioId}`);
        if (scenario) {
          scenarios.push(scenario);
        }
      }
    }

    res.json(scenarios);
  } catch (error) {
    console.error('Error listing scenarios:', error);
    res.status(500).json({
      error: 'Internal server error listing scenarios',
      details: error.message,
    });
  }
});

// POST /qa/run - Run a scenario against a persona
router.post('/qa/run', async (req, res) => {
  try {
    const { personaId, scenarioId } = req.body;

    // Validate request
    if (!personaId || typeof personaId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. personaId is required and must be a string.',
      });
    }
    if (!scenarioId || typeof scenarioId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. scenarioId is required and must be a string.',
      });
    }

    // Load persona
    const persona = dal.readData(`personas/${personaId}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${personaId}`,
      });
    }

    // Find scenario by ID (search all role directories)
    let scenario = null;
    for (const slug of Object.values(ROLE_TO_SLUG)) {
      const candidate = dal.readData(`scenarios/${slug}/${scenarioId}`);
      if (candidate) {
        scenario = candidate;
        break;
      }
    }

    if (!scenario) {
      return res.status(404).json({
        error: `Scenario not found: ${scenarioId}`,
      });
    }

    // Build the question with context
    const fullQuestion = `Context: ${scenario.context}\n\nQuestion: ${scenario.question}`;

    // Use persona's promptText as system prompt and call LLM
    const systemPrompt = persona.promptText;
    const llmMessages = [{ role: 'user', content: fullQuestion }];
    const response = await llm.chat(systemPrompt, llmMessages);

    // Create evaluation record (pending scoring)
    const evaluationId = Math.random().toString(36).substring(2, 15);
    const evaluation = {
      id: evaluationId,
      personaId,
      personaRole: persona.role,
      personaVersion: persona.version || 1,
      scenarioId,
      scenarioTitle: scenario.title,
      question: fullQuestion,
      response,
      status: 'pending', // pending, scored
      scores: null,
      comments: null,
      evaluatedBy: null,
      evaluatedAt: null,
      createdAt: new Date().toISOString(),
    };

    dal.writeData(`evaluations/${evaluationId}`, evaluation);

    res.json({
      evaluationId,
      personaId,
      scenarioId,
      response,
    });
  } catch (error) {
    console.error('Error running scenario:', error);
    res.status(500).json({
      error: 'Internal server error running scenario',
      details: error.message,
    });
  }
});

// POST /qa/evaluate - Submit evaluation scores
router.post('/qa/evaluate', (req, res) => {
  try {
    const { evaluationId, accuracy, tone, actionability, riskAwareness, comments } = req.body;

    // Validate request
    if (!evaluationId || typeof evaluationId !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. evaluationId is required and must be a string.',
      });
    }

    // Validate scores (1-5)
    const scores = { accuracy, tone, actionability, riskAwareness };
    for (const [key, value] of Object.entries(scores)) {
      if (value === undefined || value === null) {
        return res.status(400).json({
          error: `Invalid request. ${key} is required.`,
        });
      }
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return res.status(400).json({
          error: `Invalid ${key}. Must be an integer between 1 and 5.`,
        });
      }
    }

    // Load evaluation
    const evaluation = dal.readData(`evaluations/${evaluationId}`);
    if (!evaluation) {
      return res.status(404).json({
        error: `Evaluation not found: ${evaluationId}`,
      });
    }

    // Update evaluation with scores
    evaluation.scores = {
      accuracy,
      tone,
      actionability,
      riskAwareness,
      average: (accuracy + tone + actionability + riskAwareness) / 4,
    };
    evaluation.comments = comments || null;
    evaluation.status = 'scored';
    evaluation.evaluatedAt = new Date().toISOString();

    dal.writeData(`evaluations/${evaluationId}`, evaluation);

    res.json({
      evaluationId,
      scores: evaluation.scores,
      status: evaluation.status,
      evaluatedAt: evaluation.evaluatedAt,
    });
  } catch (error) {
    console.error('Error submitting evaluation:', error);
    res.status(500).json({
      error: 'Internal server error submitting evaluation',
      details: error.message,
    });
  }
});

// GET /qa/evaluations - List all evaluations
router.get('/qa/evaluations', (req, res) => {
  try {
    const { personaId, scenarioId, status } = req.query;
    const evaluationIds = listDataDir('evaluations');
    let evaluations = [];

    for (const id of evaluationIds) {
      const evaluation = dal.readData(`evaluations/${id}`);
      if (evaluation) {
        evaluations.push(evaluation);
      }
    }

    // Apply filters
    if (personaId) {
      evaluations = evaluations.filter(e => e.personaId === personaId);
    }
    if (scenarioId) {
      evaluations = evaluations.filter(e => e.scenarioId === scenarioId);
    }
    if (status) {
      evaluations = evaluations.filter(e => e.status === status);
    }

    // Sort by createdAt (newest first)
    evaluations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(evaluations);
  } catch (error) {
    console.error('Error listing evaluations:', error);
    res.status(500).json({
      error: 'Internal server error listing evaluations',
      details: error.message,
    });
  }
});

// GET /qa/evaluations/:id - Get a single evaluation
router.get('/qa/evaluations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const evaluation = dal.readData(`evaluations/${id}`);

    if (!evaluation) {
      return res.status(404).json({
        error: `Evaluation not found: ${id}`,
      });
    }

    res.json(evaluation);
  } catch (error) {
    console.error('Error getting evaluation:', error);
    res.status(500).json({
      error: 'Internal server error getting evaluation',
      details: error.message,
    });
  }
});

// ============================================
// QA ANALYTICS ENDPOINTS (Story 5.2)
// ============================================

const LOW_SCORE_THRESHOLD = 3.5;

// Helper to load all evaluations
function getAllEvaluations() {
  const evaluationIds = listDataDir('evaluations');
  const evaluations = [];
  for (const id of evaluationIds) {
    const evaluation = dal.readData(`evaluations/${id}`);
    if (evaluation && evaluation.status === 'scored') {
      evaluations.push(evaluation);
    }
  }
  return evaluations;
}

// Helper to calculate average scores from evaluations
function calculateAverageScores(evaluations) {
  if (evaluations.length === 0) {
    return { accuracy: 0, tone: 0, actionability: 0, riskAwareness: 0, overall: 0 };
  }

  const totals = { accuracy: 0, tone: 0, actionability: 0, riskAwareness: 0 };
  for (const evaluation of evaluations) {
    if (evaluation.scores) {
      totals.accuracy += evaluation.scores.accuracy || 0;
      totals.tone += evaluation.scores.tone || 0;
      totals.actionability += evaluation.scores.actionability || 0;
      totals.riskAwareness += evaluation.scores.riskAwareness || 0;
    }
  }

  const count = evaluations.length;
  const averages = {
    accuracy: Math.round((totals.accuracy / count) * 100) / 100,
    tone: Math.round((totals.tone / count) * 100) / 100,
    actionability: Math.round((totals.actionability / count) * 100) / 100,
    riskAwareness: Math.round((totals.riskAwareness / count) * 100) / 100,
  };
  averages.overall = Math.round(((averages.accuracy + averages.tone + averages.actionability + averages.riskAwareness) / 4) * 100) / 100;

  return averages;
}

// GET /qa/analytics/personas/:id - Aggregated analytics for a persona
router.get('/qa/analytics/personas/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Load persona
    const persona = dal.readData(`personas/${id}`);
    if (!persona) {
      return res.status(404).json({
        error: `Persona not found: ${id}`,
      });
    }

    // Get all evaluations for this persona
    const allEvaluations = getAllEvaluations();
    const personaEvaluations = allEvaluations.filter(e => e.personaId === id);

    // Calculate average scores
    const averageScores = calculateAverageScores(personaEvaluations);

    // Group evaluations by scenario
    const scenarioMap = {};
    for (const evaluation of personaEvaluations) {
      const scenarioId = evaluation.scenarioId;
      if (!scenarioMap[scenarioId]) {
        scenarioMap[scenarioId] = {
          scenarioId,
          scenarioTitle: evaluation.scenarioTitle,
          evaluations: [],
        };
      }
      scenarioMap[scenarioId].evaluations.push({
        evaluationId: evaluation.id,
        scores: evaluation.scores,
        comments: evaluation.comments,
        evaluatedAt: evaluation.evaluatedAt,
      });
    }

    // Calculate per-scenario averages
    const scenarioEvaluations = Object.values(scenarioMap).map(scenario => {
      const avgScores = calculateAverageScores(scenario.evaluations.map(e => ({ scores: e.scores })));
      return {
        scenarioId: scenario.scenarioId,
        scenarioTitle: scenario.scenarioTitle,
        evaluationCount: scenario.evaluations.length,
        averageScores: avgScores,
        needsAttention: avgScores.overall < LOW_SCORE_THRESHOLD,
        evaluations: scenario.evaluations,
      };
    });

    // Collect all comments
    const allComments = personaEvaluations
      .filter(e => e.comments)
      .map(e => ({
        scenarioId: e.scenarioId,
        scenarioTitle: e.scenarioTitle,
        comment: e.comments,
        evaluatedAt: e.evaluatedAt,
      }))
      .sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt));

    // Determine if persona needs calibration
    const needsCalibration = averageScores.overall < LOW_SCORE_THRESHOLD;

    res.json({
      personaId: id,
      personaRole: persona.role,
      version: persona.version || 1,
      totalEvaluations: personaEvaluations.length,
      averageScores,
      needsCalibration,
      calibrationThreshold: LOW_SCORE_THRESHOLD,
      scenarioEvaluations,
      allComments,
    });
  } catch (error) {
    console.error('Error getting persona analytics:', error);
    res.status(500).json({
      error: 'Internal server error getting persona analytics',
      details: error.message,
    });
  }
});

// GET /qa/analytics/scenarios - Analytics across all scenarios
router.get('/qa/analytics/scenarios', (req, res) => {
  try {
    const allEvaluations = getAllEvaluations();

    // Group by scenario
    const scenarioMap = {};
    for (const evaluation of allEvaluations) {
      const scenarioId = evaluation.scenarioId;
      if (!scenarioMap[scenarioId]) {
        scenarioMap[scenarioId] = {
          scenarioId,
          scenarioTitle: evaluation.scenarioTitle,
          evaluations: [],
          personasEvaluated: new Set(),
        };
      }
      scenarioMap[scenarioId].evaluations.push(evaluation);
      scenarioMap[scenarioId].personasEvaluated.add(evaluation.personaId);
    }

    // Calculate analytics per scenario
    const scenarios = Object.values(scenarioMap).map(scenario => {
      const avgScores = calculateAverageScores(scenario.evaluations);
      const personaCount = scenario.personasEvaluated.size;

      // A scenario is problematic if avg < threshold across 2+ personas
      const isProblematic = avgScores.overall < LOW_SCORE_THRESHOLD && personaCount >= 2;

      return {
        scenarioId: scenario.scenarioId,
        scenarioTitle: scenario.scenarioTitle,
        evaluationCount: scenario.evaluations.length,
        personasEvaluated: personaCount,
        averageScores: avgScores,
        isProblematic,
        comments: scenario.evaluations
          .filter(e => e.comments)
          .map(e => ({
            personaId: e.personaId,
            personaRole: e.personaRole,
            comment: e.comments,
          })),
      };
    });

    // Sort: problematic first, then by overall score ascending
    scenarios.sort((a, b) => {
      if (a.isProblematic !== b.isProblematic) return a.isProblematic ? -1 : 1;
      return a.averageScores.overall - b.averageScores.overall;
    });

    const problematicCount = scenarios.filter(s => s.isProblematic).length;

    res.json({
      totalScenarios: scenarios.length,
      totalEvaluations: allEvaluations.length,
      problematicScenarios: problematicCount,
      threshold: LOW_SCORE_THRESHOLD,
      scenarios,
    });
  } catch (error) {
    console.error('Error getting scenario analytics:', error);
    res.status(500).json({
      error: 'Internal server error getting scenario analytics',
      details: error.message,
    });
  }
});

// GET /qa/analytics/summary - Overall QA health summary
router.get('/qa/analytics/summary', (req, res) => {
  try {
    const allEvaluations = getAllEvaluations();

    // Get all evaluated personas
    const personaMap = {};
    for (const evaluation of allEvaluations) {
      const personaId = evaluation.personaId;
      if (!personaMap[personaId]) {
        personaMap[personaId] = {
          personaId,
          personaRole: evaluation.personaRole,
          personaVersion: evaluation.personaVersion,
          evaluations: [],
        };
      }
      personaMap[personaId].evaluations.push(evaluation);
    }

    // Calculate per-persona stats and identify flagged personas
    const personaStats = Object.values(personaMap).map(persona => {
      const avgScores = calculateAverageScores(persona.evaluations);
      return {
        personaId: persona.personaId,
        personaRole: persona.personaRole,
        version: persona.personaVersion,
        evaluationCount: persona.evaluations.length,
        averageScores: avgScores,
        needsCalibration: avgScores.overall < LOW_SCORE_THRESHOLD,
      };
    });

    const flaggedPersonas = personaStats.filter(p => p.needsCalibration);

    // Get scenario stats
    const scenarioMap = {};
    for (const evaluation of allEvaluations) {
      const scenarioId = evaluation.scenarioId;
      if (!scenarioMap[scenarioId]) {
        scenarioMap[scenarioId] = {
          scenarioId,
          scenarioTitle: evaluation.scenarioTitle,
          evaluations: [],
          personasEvaluated: new Set(),
        };
      }
      scenarioMap[scenarioId].evaluations.push(evaluation);
      scenarioMap[scenarioId].personasEvaluated.add(evaluation.personaId);
    }

    const problematicScenarios = Object.values(scenarioMap)
      .map(s => ({
        scenarioId: s.scenarioId,
        scenarioTitle: s.scenarioTitle,
        averageScore: calculateAverageScores(s.evaluations).overall,
        personasEvaluated: s.personasEvaluated.size,
      }))
      .filter(s => s.averageScore < LOW_SCORE_THRESHOLD && s.personasEvaluated >= 2);

    // Overall averages
    const overallAverages = calculateAverageScores(allEvaluations);

    res.json({
      summary: {
        totalEvaluations: allEvaluations.length,
        totalPersonasEvaluated: Object.keys(personaMap).length,
        totalScenariosUsed: Object.keys(scenarioMap).length,
        overallAverageScore: overallAverages.overall,
        threshold: LOW_SCORE_THRESHOLD,
      },
      overallAverages,
      flaggedPersonas: {
        count: flaggedPersonas.length,
        personas: flaggedPersonas.map(p => ({
          personaId: p.personaId,
          role: p.personaRole,
          version: p.version,
          averageScore: p.averageScores.overall,
        })),
      },
      problematicScenarios: {
        count: problematicScenarios.length,
        scenarios: problematicScenarios,
      },
      personaStats,
    });
  } catch (error) {
    console.error('Error getting QA summary:', error);
    res.status(500).json({
      error: 'Internal server error getting QA summary',
      details: error.message,
    });
  }
});

// GET /qa/analytics/export - Export evaluations as CSV
router.get('/qa/analytics/export', (req, res) => {
  try {
    const { format } = req.query;

    if (format !== 'csv') {
      return res.status(400).json({
        error: 'Invalid format. Only "csv" is supported.',
      });
    }

    const allEvaluations = getAllEvaluations();

    // Build CSV header
    const headers = [
      'Evaluation ID',
      'Persona ID',
      'Persona Role',
      'Persona Version',
      'Scenario ID',
      'Scenario Title',
      'Accuracy',
      'Tone',
      'Actionability',
      'Risk Awareness',
      'Average',
      'Comments',
      'Evaluated At',
    ];

    // Build CSV rows
    const rows = allEvaluations.map(e => [
      e.id,
      e.personaId,
      e.personaRole || '',
      e.personaVersion || 1,
      e.scenarioId,
      e.scenarioTitle || '',
      e.scores?.accuracy || '',
      e.scores?.tone || '',
      e.scores?.actionability || '',
      e.scores?.riskAwareness || '',
      e.scores?.average || '',
      (e.comments || '').replace(/"/g, '""'), // Escape quotes for CSV
      e.evaluatedAt || '',
    ]);

    // Format as CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="qa-evaluations.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting evaluations:', error);
    res.status(500).json({
      error: 'Internal server error exporting evaluations',
      details: error.message,
    });
  }
});

// ============================================
// ADMIN DASHBOARD ENDPOINT (Story 4.2)
// ============================================

// GET /admin/dashboard - Admin overview of system data
router.get('/admin/dashboard', (req, res) => {
  try {
    const interviewIds = listDataDir('interviews');
    const personaIds = listDataDir('personas');

    // Count interviews by status
    let totalInterviews = interviewIds.length;
    let scheduledInterviews = 0;
    let activeInterviews = 0;
    let completedInterviews = 0;

    for (const id of interviewIds) {
      const interview = dal.readData(`interviews/${id}`);
      if (interview) {
        if (interview.phase === 'complete') {
          completedInterviews++;
        } else if (interview.messages && interview.messages.length > 0) {
          activeInterviews++;
        } else {
          scheduledInterviews++;
        }
      }
    }

    // Count personas by status
    let completedPersonas = 0; // Total personas generated
    let validatedPersonas = 0;
    let draftPersonas = 0;
    let deprecatedPersonas = 0;

    for (const id of personaIds) {
      const persona = dal.readData(`personas/${id}`);
      if (persona) {
        completedPersonas++;
        let status = persona.status || 'Draft';
        // Normalize status
        if (status === 'draft') status = 'Draft';
        else if (status === 'active' || status === 'pending') status = 'Validated';
        else if (status === 'archived') status = 'Deprecated';

        if (status === 'Validated') validatedPersonas++;
        else if (status === 'Draft') draftPersonas++;
        else if (status === 'Deprecated') deprecatedPersonas++;
      }
    }

    // Response matches spec format
    res.json({
      totalInterviews,
      completedPersonas,
      validatedPersonas,
      draftPersonas,
      // Additional useful metrics
      scheduledInterviews,
      activeInterviews,
      completedInterviews,
      deprecatedPersonas,
    });
  } catch (error) {
    console.error('Error getting admin dashboard:', error);
    res.status(500).json({
      error: 'Internal server error getting admin dashboard',
      details: error.message,
    });
  }
});

// ============================================
// ADMIN ADVISOR LOGS ENDPOINTS (Story 3.2)
// ============================================

// GET /admin/advisor-logs - List advisor interaction logs with filters
router.get('/admin/advisor-logs', (req, res) => {
  try {
    const { personaId, userId, fromDate, toDate, page, limit } = req.query;

    // Load all advisor logs
    const logIds = listDataDir('advisor-logs');
    let logs = [];

    for (const id of logIds) {
      const log = dal.readData(`advisor-logs/${id}`);
      if (log) {
        logs.push(log);
      }
    }

    // Apply filters
    if (personaId) {
      logs = logs.filter(l => l.personaId === personaId);
    }
    if (userId) {
      logs = logs.filter(l => l.userId === userId);
    }
    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      logs = logs.filter(l => new Date(l.createdAt).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      logs = logs.filter(l => new Date(l.createdAt).getTime() <= toTimestamp);
    }

    // Sort by createdAt (newest first)
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const totalLogs = logs.length;
    const totalPages = Math.ceil(totalLogs / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalLogs,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing advisor logs:', error);
    res.status(500).json({
      error: 'Internal server error listing advisor logs',
      details: error.message,
    });
  }
});

// GET /admin/advisor-logs/:id - Get a single advisor log
router.get('/admin/advisor-logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const log = dal.readData(`advisor-logs/${id}`);

    if (!log) {
      return res.status(404).json({
        error: `Advisor log not found: ${id}`,
      });
    }

    res.json(log);
  } catch (error) {
    console.error('Error getting advisor log:', error);
    res.status(500).json({
      error: 'Internal server error getting advisor log',
      details: error.message,
    });
  }
});

module.exports = router;
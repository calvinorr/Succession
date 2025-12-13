require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;
const dal = require('../dal/dal');
const llm = require('../services/llm');
const interviewer = require('../agents/interviewer');
const noteTaker = require('../agents/note-taker');
const personaBuilder = require('../agents/persona-builder');
const knowledgeBuilder = require('../agents/knowledge-builder');
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('src/ui'));

// Configuration for auto-snapshot
const SNAPSHOT_INTERVAL = 5; // Create snapshot every N user messages

/**
 * Helper function to create a knowledge snapshot for an interview
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

    return snapshot;
  } catch (error) {
    console.error(`Error creating auto-snapshot for ${interviewId}:`, error.message);
    return null;
  }
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
app.get('/dashboard/stats', (req, res) => {
  try {
    const interviewIds = listDataDir('interviews');
    const personaIds = listDataDir('personas');
    const expertIds = listDataDir('experts');
    const projectIds = listDataDir('projects');
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

    // Count projects by status
    const projectsByStatus = { draft: 0, active: 0, complete: 0 };

    for (const id of projectIds) {
      const project = dal.readData(`projects/${id}`);
      if (project) {
        const status = project.status || 'draft';
        if (projectsByStatus[status] !== undefined) {
          projectsByStatus[status]++;
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
      // Projects
      totalProjects: projectIds.length,
      projectsByStatus,
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

// GET /interviews - List all interviews
app.get('/interviews', (req, res) => {
  try {
    const { status: filterStatus, expertId, projectId, topicId } = req.query;
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
          // For UI compatibility with designs
          expertName: interview.expertName || 'Unknown Expert',
          industry: interview.industry || 'Finance & Banking',
          // New fields
          expertId: interview.expertId || null,
          projectId: interview.projectId || null,
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
    if (projectId) {
      interviews = interviews.filter(i => i.projectId === projectId);
    }
    if (topicId) {
      interviews = interviews.filter(i => i.topicId === topicId);
    }

    // Sort by createdAt (newest first)
    interviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
app.get('/interviews/:id', (req, res) => {
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
      projectId: interview.projectId || null,
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
app.get('/personas', (req, res) => {
  try {
    const { status: filterStatus, role: filterRole, industry, isFavorite, latestValidated } = req.query;
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

    // Sort by role, then by version descending
    personas.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role.localeCompare(b.role);
      }
      return b.version - a.version;
    });

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
app.post('/interviews/start', (req, res) => {
  const { role, expertName, industry, projectTitle, description, topics, expertId, projectId, topicId, questions } = req.body || {};

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
  const interview = {
    id: interviewId,
    role: role || null,
    phase: 'warm-up',
    messages: [],
    questions: normalizedQuestions,
    questionsCompleted: [],
    createdAt: new Date().toISOString(),
    ...(expertName && { expertName }),
    ...(industry && { industry }),
    ...(projectTitle && { projectTitle }),
    ...(description && { description }),
    ...(expertId && { expertId }),
    ...(projectId && { projectId }),
    ...(topicId && { topicId }),
  };

  dal.writeData(`interviews/${interviewId}`, interview);
  res.json(interview);
});

// PUT /interviews/{id} - Update an interview
app.put('/interviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { expertName, industry, phase, status, expertId, projectId, topicId, questions, questionsCompleted } = req.body;

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
    if (projectId !== undefined) interview.projectId = projectId;
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
app.post('/interviews/:id/complete', async (req, res) => {
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
app.get('/interviews/:id/transcript', (req, res) => {
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
app.post('/interviews/:id/message', async (req, res) => {
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

    // Return JSON response with assistant's message and coverage info
    const response = {
      response: assistantContent,
      ...(interview.coverage && { coverage: interview.coverage }),
      ...(isDoneCommand && { topicComplete: true }),
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
app.get('/interviews/:id/coverage', (req, res) => {
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
app.post('/interviews/:id/note-snapshot', async (req, res) => {
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
app.get('/interviews/:id/snapshots', (req, res) => {
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

// POST /personas/build
app.post('/personas/build', async (req, res) => {
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
app.get('/personas/:id', (req, res) => {
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
app.put('/personas/:id', (req, res) => {
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

// POST /personas/{id}/view - Record a view timestamp
app.post('/personas/:id/view', (req, res) => {
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
app.post('/personas/:id/advise', async (req, res) => {
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
app.post('/personas/:id/feedback', (req, res) => {
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
// EXPERT ENDPOINTS
// ============================================

// GET /experts - List all experts
app.get('/experts', (req, res) => {
  try {
    const expertIds = listDataDir('experts');
    const experts = [];

    for (const id of expertIds) {
      const expert = dal.readData(`experts/${id}`);
      if (expert) {
        experts.push(expert);
      }
    }

    // Sort by createdAt (newest first)
    experts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(experts);
  } catch (error) {
    console.error('Error listing experts:', error);
    res.status(500).json({
      error: 'Internal server error listing experts',
      details: error.message,
    });
  }
});

// GET /experts/:id - Get a single expert
app.get('/experts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const expert = dal.readData(`experts/${id}`);

    if (!expert) {
      return res.status(404).json({
        error: `Expert not found: ${id}`,
      });
    }

    res.json(expert);
  } catch (error) {
    console.error('Error getting expert:', error);
    res.status(500).json({
      error: 'Internal server error getting expert',
      details: error.message,
    });
  }
});

// POST /experts - Create a new expert
app.post('/experts', (req, res) => {
  try {
    const { name, email, photo, organization, industry, yearsOfExperience } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Name is required and must be a string.',
      });
    }

    const expertId = Math.random().toString(36).substring(2, 15);
    const expert = {
      id: expertId,
      name,
      email: email || null,
      photo: photo || null,
      organization: organization || null,
      industry: industry || null,
      yearsOfExperience: yearsOfExperience || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dal.writeData(`experts/${expertId}`, expert);
    res.status(201).json(expert);
  } catch (error) {
    console.error('Error creating expert:', error);
    res.status(500).json({
      error: 'Internal server error creating expert',
      details: error.message,
    });
  }
});

// PUT /experts/:id - Update an expert
app.put('/experts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, photo, organization, industry, yearsOfExperience } = req.body;

    const expert = dal.readData(`experts/${id}`);
    if (!expert) {
      return res.status(404).json({
        error: `Expert not found: ${id}`,
      });
    }

    // Merge updates
    if (name !== undefined) expert.name = name;
    if (email !== undefined) expert.email = email;
    if (photo !== undefined) expert.photo = photo;
    if (organization !== undefined) expert.organization = organization;
    if (industry !== undefined) expert.industry = industry;
    if (yearsOfExperience !== undefined) expert.yearsOfExperience = yearsOfExperience;
    expert.updatedAt = new Date().toISOString();

    dal.writeData(`experts/${id}`, expert);
    res.json(expert);
  } catch (error) {
    console.error('Error updating expert:', error);
    res.status(500).json({
      error: 'Internal server error updating expert',
      details: error.message,
    });
  }
});

// DELETE /experts/:id - Delete an expert
app.delete('/experts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const expert = dal.readData(`experts/${id}`);

    if (!expert) {
      return res.status(404).json({
        error: `Expert not found: ${id}`,
      });
    }

    // Delete the file
    const filePath = `./data/experts/${id}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expert:', error);
    res.status(500).json({
      error: 'Internal server error deleting expert',
      details: error.message,
    });
  }
});

// ============================================
// PROJECT ENDPOINTS
// ============================================

const VALID_PROJECT_STATUSES = ['draft', 'active', 'complete'];

// GET /projects - List all projects
app.get('/projects', (req, res) => {
  try {
    const { status, expertId } = req.query;
    const projectIds = listDataDir('projects');
    let projects = [];

    for (const id of projectIds) {
      const project = dal.readData(`projects/${id}`);
      if (project) {
        projects.push(project);
      }
    }

    // Apply filters
    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    if (expertId) {
      projects = projects.filter(p => p.expertId === expertId);
    }

    // Sort by createdAt (newest first)
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({
      error: 'Internal server error listing projects',
      details: error.message,
    });
  }
});

// GET /projects/:id - Get a single project
app.get('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const project = dal.readData(`projects/${id}`);

    if (!project) {
      return res.status(404).json({
        error: `Project not found: ${id}`,
      });
    }

    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({
      error: 'Internal server error getting project',
      details: error.message,
    });
  }
});

// POST /projects - Create a new project
app.post('/projects', (req, res) => {
  try {
    const { title, description, deadline, targetPersonaId, expertId, status, topics } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Title is required and must be a string.',
      });
    }

    // Validate status if provided
    const projectStatus = status || 'draft';
    if (!VALID_PROJECT_STATUSES.includes(projectStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_PROJECT_STATUSES.join(', ')}`,
      });
    }

    // Validate and normalize topics
    let normalizedTopics = [];
    if (topics && Array.isArray(topics)) {
      normalizedTopics = topics.map((topic, index) => ({
        id: topic.id || Math.random().toString(36).substring(2, 10),
        title: topic.title || `Topic ${index + 1}`,
        description: topic.description || '',
        order: topic.order !== undefined ? topic.order : index,
      }));
    }

    const projectId = Math.random().toString(36).substring(2, 15);
    const project = {
      id: projectId,
      title,
      description: description || null,
      deadline: deadline || null,
      targetPersonaId: targetPersonaId || null,
      expertId: expertId || null,
      status: projectStatus,
      topics: normalizedTopics,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dal.writeData(`projects/${projectId}`, project);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      error: 'Internal server error creating project',
      details: error.message,
    });
  }
});

// PUT /projects/:id - Update a project
app.put('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline, targetPersonaId, expertId, status, topics } = req.body;

    const project = dal.readData(`projects/${id}`);
    if (!project) {
      return res.status(404).json({
        error: `Project not found: ${id}`,
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_PROJECT_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_PROJECT_STATUSES.join(', ')}`,
      });
    }

    // Merge updates
    if (title !== undefined) project.title = title;
    if (description !== undefined) project.description = description;
    if (deadline !== undefined) project.deadline = deadline;
    if (targetPersonaId !== undefined) project.targetPersonaId = targetPersonaId;
    if (expertId !== undefined) project.expertId = expertId;
    if (status !== undefined) project.status = status;
    if (topics !== undefined) {
      project.topics = topics.map((topic, index) => ({
        id: topic.id || Math.random().toString(36).substring(2, 10),
        title: topic.title || `Topic ${index + 1}`,
        description: topic.description || '',
        order: topic.order !== undefined ? topic.order : index,
      }));
    }
    project.updatedAt = new Date().toISOString();

    dal.writeData(`projects/${id}`, project);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      error: 'Internal server error updating project',
      details: error.message,
    });
  }
});

// DELETE /projects/:id - Delete a project
app.delete('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const project = dal.readData(`projects/${id}`);

    if (!project) {
      return res.status(404).json({
        error: `Project not found: ${id}`,
      });
    }

    // Delete the file
    const filePath = `./data/projects/${id}.json`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      error: 'Internal server error deleting project',
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
app.get('/topics', (req, res) => {
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
app.get('/topics/:id', (req, res) => {
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
app.post('/topics', (req, res) => {
  try {
    const { name, description, frequency, order } = req.body;

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
app.put('/topics/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, frequency, order, status } = req.body;

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
app.delete('/topics/:id', (req, res) => {
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
app.put('/topics/reorder', (req, res) => {
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
app.post('/topics/:id/synthesize', async (req, res) => {
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
app.get('/knowledge-entries', (req, res) => {
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
app.get('/knowledge-entries/:id', (req, res) => {
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
app.put('/knowledge-entries/:id', (req, res) => {
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
app.delete('/knowledge-entries/:id', (req, res) => {
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
app.get('/qa/scenarios/:role', (req, res) => {
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
app.post('/qa/run', async (req, res) => {
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
app.post('/qa/evaluate', (req, res) => {
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
app.get('/qa/evaluations', (req, res) => {
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
app.get('/qa/evaluations/:id', (req, res) => {
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
app.get('/qa/analytics/personas/:id', (req, res) => {
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
app.get('/qa/analytics/scenarios', (req, res) => {
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
app.get('/qa/analytics/summary', (req, res) => {
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
app.get('/qa/analytics/export', (req, res) => {
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
// ADMIN ADVISOR LOGS ENDPOINTS (Story 3.2)
// ============================================

// GET /admin/advisor-logs - List advisor interaction logs with filters
app.get('/admin/advisor-logs', (req, res) => {
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
app.get('/admin/advisor-logs/:id', (req, res) => {
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

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
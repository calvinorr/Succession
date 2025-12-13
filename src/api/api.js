require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;
const dal = require('../dal/dal');
const llm = require('../services/llm');
const interviewer = require('../agents/interviewer');
const noteTaker = require('../agents/note-taker');
const personaBuilder = require('../agents/persona-builder');
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

    // Count personas by status
    const personasByStatus = { draft: 0, pending: 0, active: 0, archived: 0 };
    let favoritePersonas = 0;

    for (const id of personaIds) {
      const persona = dal.readData(`personas/${id}`);
      if (persona) {
        const status = persona.status || 'draft';
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
    const { status: filterStatus, expertId, projectId } = req.query;
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

const VALID_PERSONA_STATUSES = ['draft', 'pending', 'active', 'archived'];

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
    const { status: filterStatus, industry, isFavorite } = req.query;
    const personaIds = listDataDir('personas');
    let personas = [];

    for (const id of personaIds) {
      const persona = dal.readData(`personas/${id}`);
      if (persona) {
        personas.push({
          id: persona.id,
          name: persona.name || persona.role,
          role: persona.role,
          organization: persona.organization || 'Organization',
          bio: persona.bio || persona.promptText?.substring(0, 150) + '...',
          photoUrl: persona.photoUrl || null,
          status: persona.status || 'draft',
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
    if (industry) {
      personas = personas.filter(p => p.industry.toLowerCase().includes(industry.toLowerCase()));
    }
    if (isFavorite === 'true') {
      personas = personas.filter(p => p.isFavorite === true);
    }

    // Sort by createdAt (newest first)
    personas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
  const { role, expertName, industry, projectTitle, description, topics, expertId, projectId, questions } = req.body || {};

  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
    });
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
    role,
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
  };

  dal.writeData(`interviews/${interviewId}`, interview);
  res.json(interview);
});

// PUT /interviews/{id} - Update an interview
app.put('/interviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { expertName, industry, phase, status, expertId, projectId, questions, questionsCompleted } = req.body;

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

    // Add user message to messages array
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    interview.messages.push(userMessage);

    // Get system prompt from interviewer agent
    const systemPrompt = interviewer.getSystemPrompt(
      interview.role,
      interview.phase
    );

    // Call LLM service with system prompt and full message history
    const assistantContent = await llm.chat(systemPrompt, interview.messages);

    // Add assistant response to messages array
    const assistantMessage = {
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString(),
    };
    interview.messages.push(assistantMessage);

    // Save updated interview to DAL
    dal.writeData(`interviews/${id}`, interview);

    // Check if we should auto-trigger a snapshot
    const userMessageCount = interview.messages.filter(m => m.role === 'user').length;
    if (userMessageCount > 0 && userMessageCount % SNAPSHOT_INTERVAL === 0) {
      // Trigger snapshot asynchronously (don't block response)
      createSnapshot(id).catch(err => {
        console.error('Auto-snapshot failed:', err.message);
      });
    }

    // Return JSON response with assistant's message
    res.json({ response: assistantContent });
  } catch (error) {
    console.error('Error handling message:', error);
    res.status(500).json({
      error: 'Internal server error processing message',
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

    // Create persona object
    const personaId = Math.random().toString(36).substring(2, 15);
    const persona = {
      id: personaId,
      role: interview.role,
      interviewId,
      promptText,
      status: 'draft',
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

    // Return the persona object
    res.json(persona);
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

    // Add updatedAt timestamp
    persona.updatedAt = new Date().toISOString();

    // Save updated persona
    dal.writeData(`personas/${id}`, persona);

    // Return updated persona
    res.json(persona);
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
    const { question } = req.body;

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

// POST /personas/{id}/feedback
app.post('/personas/:id/feedback', (req, res) => {
  // TODO: Implement feedback logic
  res.send(`Feedback received for persona ${req.params.id}`);
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

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
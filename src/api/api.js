const express = require('express');
const app = express();
const port = 3000;
const dal = require('../dal/dal');

app.use(express.json());
app.use(express.static('src/ui'));

// POST /interviews/start
app.post('/interviews/start', (req, res) => {
  // TODO: Implement interview start logic
  const interviewId = Math.random().toString(36).substring(2, 15);
  const interview = {
    id: interviewId,
    messages: [],
  };
  dal.writeData(`interviews/${interviewId}`, interview);
  res.send(`Interview started with ID: ${interviewId}`);
});

// POST /interviews/{id}/message
app.post('/interviews/:id/message', (req, res) => {
  // TODO: Implement message handling logic
  res.send(`Message received for interview ${req.params.id}`);
});

// POST /interviews/{id}/note-snapshot
app.post('/interviews/:id/note-snapshot', (req, res) => {
  // TODO: Implement note snapshot logic
  res.send(`Note snapshot received for interview ${req.params.id}`);
});

// POST /personas/build
app.post('/personas/build', (req, res) => {
  // TODO: Implement persona building logic
  res.send('Persona building started');
});

// GET /personas/{id}
app.get('/personas/:id', (req, res) => {
  // TODO: Implement persona retrieval logic
  res.send(`Persona retrieved: ${req.params.id}`);
});

// POST /personas/{id}/advise
app.post('/personas/:id/advise', (req, res) => {
  // TODO: Implement advise logic
  res.send(`Advise requested for persona ${req.params.id}`);
});

// POST /personas/{id}/feedback
app.post('/personas/:id/feedback', (req, res) => {
  // TODO: Implement feedback logic
  res.send(`Feedback received for persona ${req.params.id}`);
});

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
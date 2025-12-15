/**
 * Succession API Server
 * Main entry point - mounts all route modules
 */
require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('src/ui'));

// Route modules
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const legacyRoutes = require('./routes/legacy');

// Mount routes
app.use('/auth', authRoutes);
app.use('/tasks', taskRoutes);
app.use('/', legacyRoutes);

// Start server
app.listen(port, () => {
  console.log(`Succession API listening at http://localhost:${port}`);
});

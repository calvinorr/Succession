/**
 * Task Routes
 * CRUD endpoints for managing expert tasks
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const dal = require('../../dal/dal');
const { authMiddleware, generateId, listDataDir } = require('../helpers');

// All task routes require authentication
router.use(authMiddleware);

/**
 * GET /tasks - List current expert's tasks with progress metrics
 */
router.get('/', (req, res) => {
  try {
    const expertId = req.expertId;
    const taskIds = listDataDir('tasks');

    const tasks = taskIds
      .map(id => dal.readData(`tasks/${id}`))
      .filter(task => task && task.expertId === expertId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    // Load all topics and subtopics once for efficiency
    const allTopics = listDataDir('topics')
      .map(id => dal.readData(`topics/${id}`))
      .filter(Boolean);

    const allSubtopics = listDataDir('subtopics')
      .map(id => dal.readData(`subtopics/${id}`))
      .filter(Boolean);

    // Add computed counts and progress for each task
    const tasksWithProgress = tasks.map(task => {
      const taskTopics = allTopics.filter(t => t.taskId === task.id);
      const taskSubtopics = allSubtopics.filter(s => s.taskId === task.id);

      // Count subtopics by status
      const statusCounts = {
        draft: 0,
        interviewed: 0,
        'ai-analysed': 0,
        reviewed: 0,
        published: 0
      };

      taskSubtopics.forEach(subtopic => {
        const status = subtopic.status || 'draft';
        if (statusCounts.hasOwnProperty(status)) {
          statusCounts[status]++;
        } else {
          statusCounts.draft++;
        }
      });

      // Calculate progress percentage (published / total)
      const totalSubtopics = taskSubtopics.length;
      const publishedSubtopics = statusCounts.published;
      const progressPercent = totalSubtopics > 0
        ? Math.round((publishedSubtopics / totalSubtopics) * 100)
        : 0;

      return {
        ...task,
        topicCount: taskTopics.length,
        subtopicCount: totalSubtopics,
        publishedCount: publishedSubtopics,
        progressPercent,
        statusCounts
      };
    });

    res.json(tasksWithProgress);
  } catch (error) {
    console.error('Error listing tasks:', error);
    res.status(500).json({
      error: 'Internal server error listing tasks',
      details: error.message
    });
  }
});

/**
 * POST /tasks - Create a new task
 */
router.post('/', (req, res) => {
  try {
    const expertId = req.expertId;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Task name is required'
      });
    }

    // Get current tasks to determine order
    const taskIds = listDataDir('tasks');
    const existingTasks = taskIds
      .map(id => dal.readData(`tasks/${id}`))
      .filter(task => task && task.expertId === expertId);

    const maxOrder = existingTasks.reduce((max, task) =>
      Math.max(max, task.order || 0), -1);

    const taskId = generateId();
    const task = {
      id: taskId,
      expertId,
      name: name.trim(),
      description: description?.trim() || null,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dal.writeData(`tasks/${taskId}`, task);

    res.status(201).json({
      ...task,
      topicCount: 0
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      error: 'Internal server error creating task',
      details: error.message
    });
  }
});

/**
 * PUT /tasks/reorder - Reorder tasks
 * Body: { taskIds: ['id1', 'id2', 'id3'] } - array of task IDs in desired order
 * NOTE: This route must be defined before /:id routes
 */
router.put('/reorder', (req, res) => {
  try {
    const expertId = req.expertId;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({
        error: 'taskIds must be an array'
      });
    }

    // Validate all tasks belong to this expert
    const tasks = [];
    for (const taskId of taskIds) {
      const task = dal.readData(`tasks/${taskId}`);
      if (!task) {
        return res.status(404).json({
          error: `Task not found: ${taskId}`
        });
      }
      if (task.expertId !== expertId) {
        return res.status(403).json({
          error: `Access denied for task: ${taskId}`
        });
      }
      tasks.push(task);
    }

    // Update order for each task
    tasks.forEach((task, index) => {
      task.order = index;
      task.updatedAt = new Date().toISOString();
      dal.writeData(`tasks/${task.id}`, task);
    });

    res.json({
      message: 'Tasks reordered successfully',
      count: tasks.length
    });
  } catch (error) {
    console.error('Error reordering tasks:', error);
    res.status(500).json({
      error: 'Internal server error reordering tasks',
      details: error.message
    });
  }
});

/**
 * GET /tasks/:id - Get a single task with computed counts
 */
router.get('/:id', (req, res) => {
  try {
    const expertId = req.expertId;
    const taskId = req.params.id;

    const task = dal.readData(`tasks/${taskId}`);
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    if (task.expertId !== expertId) {
      return res.status(403).json({
        error: 'Access denied - this task belongs to another expert'
      });
    }

    // Compute topic count
    const topicIds = listDataDir('topics');
    const topics = topicIds
      .map(id => dal.readData(`topics/${id}`))
      .filter(topic => topic && topic.taskId === taskId);

    // Compute subtopic counts per topic
    const subtopicIds = listDataDir('subtopics');
    const subtopics = subtopicIds
      .map(id => dal.readData(`subtopics/${id}`))
      .filter(subtopic => subtopic && subtopic.taskId === taskId);

    res.json({
      ...task,
      topicCount: topics.length,
      subtopicCount: subtopics.length,
      topics: topics.sort((a, b) => (a.order || 0) - (b.order || 0))
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      error: 'Internal server error getting task',
      details: error.message
    });
  }
});

/**
 * PUT /tasks/:id - Update a task
 */
router.put('/:id', (req, res) => {
  try {
    const expertId = req.expertId;
    const taskId = req.params.id;
    const { name, description } = req.body;

    const task = dal.readData(`tasks/${taskId}`);
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    if (task.expertId !== expertId) {
      return res.status(403).json({
        error: 'Access denied - this task belongs to another expert'
      });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Task name cannot be empty'
        });
      }
      task.name = name.trim();
    }

    if (description !== undefined) {
      task.description = description?.trim() || null;
    }

    task.updatedAt = new Date().toISOString();
    dal.writeData(`tasks/${taskId}`, task);

    // Return with topic count
    const topicIds = listDataDir('topics');
    const topicCount = topicIds
      .map(id => dal.readData(`topics/${id}`))
      .filter(topic => topic && topic.taskId === taskId)
      .length;

    res.json({
      ...task,
      topicCount
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      error: 'Internal server error updating task',
      details: error.message
    });
  }
});

/**
 * DELETE /tasks/:id - Delete a task and all its children (topics, subtopics)
 */
router.delete('/:id', (req, res) => {
  try {
    const expertId = req.expertId;
    const taskId = req.params.id;

    const task = dal.readData(`tasks/${taskId}`);
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    if (task.expertId !== expertId) {
      return res.status(403).json({
        error: 'Access denied - this task belongs to another expert'
      });
    }

    // Find and delete child subtopics first
    const subtopicIds = listDataDir('subtopics');
    const childSubtopics = subtopicIds
      .map(id => dal.readData(`subtopics/${id}`))
      .filter(subtopic => subtopic && subtopic.taskId === taskId);

    for (const subtopic of childSubtopics) {
      const subtopicPath = `./data/subtopics/${subtopic.id}.json`;
      if (fs.existsSync(subtopicPath)) {
        fs.unlinkSync(subtopicPath);
      }
    }

    // Find and delete child topics
    const topicIds = listDataDir('topics');
    const childTopics = topicIds
      .map(id => dal.readData(`topics/${id}`))
      .filter(topic => topic && topic.taskId === taskId);

    for (const topic of childTopics) {
      const topicPath = `./data/topics/${topic.id}.json`;
      if (fs.existsSync(topicPath)) {
        fs.unlinkSync(topicPath);
      }
    }

    // Delete the task itself
    const taskPath = `./data/tasks/${taskId}.json`;
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }

    res.json({
      message: 'Task deleted successfully',
      deletedTopics: childTopics.length,
      deletedSubtopics: childSubtopics.length
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      error: 'Internal server error deleting task',
      details: error.message
    });
  }
});

module.exports = router;

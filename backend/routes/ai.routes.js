const express = require('express');
const router = express.Router();
const aiService = require('../services/ai.service');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/ai/predictions/:patientId — retrieve AI risk predictions for a patient
router.get('/api/ai/predictions/:patientId', authenticate, async (req, res, next) => {
  try {
    const patientId = Number(req.params.patientId);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const predictions = await aiService.getPredictions(patientId, limit);
    res.json(predictions);
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/status — check connection status with the external AI Engine
router.get('/api/ai/status', authenticate, async (req, res, next) => {
  try {
    const status = await aiService.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

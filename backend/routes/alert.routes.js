const express = require('express');
const router = express.Router();
const alertService = require('../services/alert.service');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/alerts — retrieve safety alerts with optional query filters
router.get('/api/alerts', authenticate, async (req, res, next) => {
  try {
    const { patientId, severity, acknowledged, limit } = req.query;
    const alerts = await alertService.getAlerts({ patientId, severity, acknowledged, limit });
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/:id/acknowledge — mark alert as acknowledged
router.post('/api/alerts/:id/acknowledge', authenticate, async (req, res, next) => {
  try {
    const alertId = Number(req.params.id);
    if (!alertId || Number.isNaN(alertId)) {
      return res.status(400).json({ error: 'Valid alert ID required.' });
    }
    const result = await alertService.acknowledgeAlert(alertId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/:id/resolve — backward compatible alias for acknowledging/resolving alerts
router.post('/api/alerts/:id/resolve', authenticate, async (req, res, next) => {
  try {
    const alertId = Number(req.params.id);
    if (!alertId || Number.isNaN(alertId)) {
      return res.status(400).json({ error: 'Valid alert ID required.' });
    }
    const result = await alertService.acknowledgeAlert(alertId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

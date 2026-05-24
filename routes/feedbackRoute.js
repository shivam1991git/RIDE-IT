const express = require('express');
const router = express.Router();
const Feedback = require('../models/feedbackModel');
const auth = require('../middleware/authMiddleware');

router.post('/submit', auth(['user', 'driver']), async (req, res) => {
  try {
    const feedback = new Feedback({
      ...req.body,
      userId: req.auth.role === 'user' ? req.auth.id : undefined,
      driverId: req.auth.role === 'driver' ? req.auth.id : undefined,
    });
    await feedback.save();
    res.send('Feedback submitted successfully');
  } catch (error) {
    return res.status(400).json({ error });
  }
});

router.get('/getallfeedbacks', auth(['admin']), async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate('userId', 'username').populate('driverId', 'username');
    res.json(feedbacks);
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;

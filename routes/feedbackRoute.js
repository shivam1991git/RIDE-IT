const express = require('express');
const router = express.Router();
const Feedback = require('../models/feedbackModel');

router.post('/submit', async (req, res) => {
  try {
    const feedback = new Feedback(req.body);
    await feedback.save();
    res.send('Feedback submitted successfully');
  } catch (error) {
    return res.status(400).json({ error });
  }
});

router.get('/getallfeedbacks', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate('userId', 'username');
    res.json(feedbacks);
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;

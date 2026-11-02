const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { validate, limiter } = require('../middleware/common');
const chat = require('../services/chat');
const { createTicket } = require('./account');
const v = require('../validation');
const { asyncHandler, unauthorized, forbidden } = require('../utils/http');

const router = express.Router();
const { z } = v;

const chatLimiter = limiter({ windowMs: 60 * 1000, limit: 20, message: 'You are sending messages quickly. Please wait a few seconds.' });

const message = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1, 'Message cannot be empty').max(1000),
});

router.get('/chat/status', (req, res) => res.json({ ai: chat.aiEnabled() }));

router.post('/chat', chatLimiter, optionalAuth, validate({
    body: z.object({
        messages: z.array(message).min(1).max(12)
            .refine(list => list.length > 0 && list[list.length - 1].role === 'user', 'The last message must be from the user')
            .refine(list => list.length > 0 && list[list.length - 1].content.length <= 500, 'Please keep messages under 500 characters'),
    }),
}), asyncHandler(async (req, res) => {
    // Identity comes only from the session cookie/token, never from the body.
    res.json(await chat.reply({ messages: req.body.messages, auth: req.auth }));
}));

router.post('/chat/ticket', chatLimiter, optionalAuth, validate({
    body: z.object({ message: v.trimmed(10, 2000, 'Message') }),
}), asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized('Sign in so our team can reply to you');
    if (req.auth.role === 'admin') throw forbidden();
    const ticket = await createTicket(req.auth, { subject: 'Chat assistant request', message: req.body.message, source: 'chatbot' });
    res.status(201).json({ ticket: { _id: ticket._id, status: ticket.status } });
}));

module.exports = router;

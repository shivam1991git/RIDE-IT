const mongoose = require('mongoose');

// Sequence for human-friendly booking references (BK1001, BK1002...).
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

module.exports = { Counter: mongoose.model('counters', counterSchema) };

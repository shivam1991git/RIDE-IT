const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  carQuality: { type: Number, required: true },
  driverBehavior: { type: Number },
  userBehavior: { type: Number },
  appRating: { type: Number, required: true },
  additionalComments: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'drivers' },
}, { timestamps: true });

const Feedback = mongoose.model('feedbacks', feedbackSchema);

module.exports = Feedback;

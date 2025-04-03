const mongoose = require("mongoose");

const ReminderSchema = new mongoose.Schema({
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Medicine",
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  time: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "taken", "missed", "snoozed"],
    default: "pending"
  },
  snoozedUntil: {
    type: Date
  },
  notificationSent: {
    type: Boolean,
    default: false
  },
  notificationCount: {
    type: Number,
    default: 0
  },
  parentNotified: {
    type: Boolean,
    default: false
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // For recurring reminders
  repeat: {
    type: String,
    enum: ["none", "daily", "weekly", "monthly", "custom"],
    default: "none"
  },
  // For custom repeat intervals
  repeatInterval: {
    type: Number,
    min: 1
  },
  repeatUnit: {
    type: String,
    enum: ["hours", "days", "weeks", "months"],
    default: "days"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index on user and time
ReminderSchema.index({ user: 1, time: 1 });

module.exports = mongoose.model("Reminder", ReminderSchema);

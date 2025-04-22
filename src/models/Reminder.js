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
  // Schedule information
  scheduleStart: {
    type: Date,
    required: true,
    default: Date.now
  },
  scheduleEnd: {
    type: Date
  },
  active: {
    type: Boolean,
    default: true
  },
  // Frequency and timing settings
  frequency: {
    type: String,
    enum: ["once", "twice", "thrice", "custom"],
    required: true
  },
  // For upcoming scheduled instance
  time: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "completed", "partially_completed", "missed", "snoozed"],
    default: "pending"
  },
  snoozedUntil: {
    type: Date
  },
  missedAt: {
    type: Date,
    default: null
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
  // For recurring reminders
  repeat: {
    type: String,
    enum: ["none", "daily", "weekly", "monthly", "custom"],
    default: "none"
  },
  // For weekly repeat - days of week (0=Sunday, 1=Monday, etc.)
  daysOfWeek: {
    type: [Number],
    validate: {
      validator: function (v) {
        return v.every((day) => day >= 0 && day <= 6);
      },
      message: "Days of week must be between 0 (Sunday) and 6 (Saturday)"
    }
  },
  // For monthly repeat - days of month
  daysOfMonth: {
    type: [Number],
    validate: {
      validator: function (v) {
        return v.every((day) => day >= 1 && day <= 31);
      },
      message: "Days of month must be between 1 and 31"
    }
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
    default: () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      return new Date(now.getTime() + istOffset);
    }
  }
});

// Create a compound index on user and time
ReminderSchema.index({ user: 1, time: 1 });

// Update overall status based on medicine statuses
ReminderSchema.pre("save", function (next) {
  if (this.isModified("medicines")) {
    const statuses = this.medicines.map((m) => m.status);

    if (statuses.every((s) => s === "taken")) {
      this.status = "completed";
    } else if (
      statuses.some((s) => s === "taken") &&
      !statuses.every((s) => s === "taken")
    ) {
      this.status = "partially_completed";
    } else if (statuses.some((s) => s === "missed")) {
      this.status = "missed";
    }
  }

  next();
});

module.exports = mongoose.model("Reminder", ReminderSchema);

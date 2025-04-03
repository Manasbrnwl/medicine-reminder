const Reminder = require("../models/Reminder");
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const {
  scheduleReminder,
  cancelReminder,
  snoozeReminder
} = require("../../utils/scheduler");
const {
  sendPushNotification,
  formatReminderNotification,
  formatMissedDoseNotification
} = require("../../utils/notifications");

// @desc    Get all reminders for a user
// @route   GET /api/reminders
// @access  Private
exports.getReminders = async (req, res) => {
  try {
    const userId = req.user.id;
    const reminders = await Reminder.find({ user: userId })
      .populate("medicine")
      .sort({ time: 1 });

    res.json({
      success: true,
      count: reminders.length,
      data: reminders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get all reminders for a dependent
// @route   GET /api/reminders/dependent/:dependentId
// @access  Private
exports.getDependentReminders = async (req, res) => {
  try {
    const { dependentId } = req.params;

    // Check if the requesting user is the parent of the dependent
    const dependent = await User.findById(dependentId);
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    if (dependent.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this dependent's reminders"
      });
    }

    const reminders = await Reminder.find({ user: dependentId })
      .populate("medicine")
      .sort({ time: 1 });

    res.json({
      success: true,
      count: reminders.length,
      data: reminders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get a single reminder
// @route   GET /api/reminders/:id
// @access  Private
exports.getReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id).populate(
      "medicine"
    );

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this reminder"
      });
    }

    res.json({
      success: true,
      data: reminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Create a new reminder
// @route   POST /api/reminders
// @access  Private
exports.createReminder = async (req, res) => {
  try {
    // Check if medicine exists and user has access
    const medicine = await Medicine.findById(req.body.medicine);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    if (medicine.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create reminder for this medicine"
      });
    }

    // Add user to req.body
    req.body.user = req.user.id;

    const reminder = await Reminder.create(req.body);

    // Schedule the reminder notification
    const io = req.app.get("io");
    await scheduleReminder(reminder, io);

    res.status(201).json({
      success: true,
      data: reminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Create a reminder for a dependent
// @route   POST /api/reminders/dependent/:dependentId
// @access  Private
exports.createReminderForDependent = async (req, res) => {
  try {
    const { dependentId } = req.params;

    // Check if the requesting user is the parent of the dependent
    const dependent = await User.findById(dependentId);
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    if (dependent.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create reminder for this dependent"
      });
    }

    // Check if medicine exists and belongs to the dependent
    const medicine = await Medicine.findById(req.body.medicine);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    if (medicine.user.toString() !== dependentId) {
      return res.status(403).json({
        success: false,
        message: "This medicine does not belong to the dependent"
      });
    }

    // Add dependent as user to req.body
    req.body.user = dependentId;

    const reminder = await Reminder.create(req.body);

    // Schedule the reminder notification
    const io = req.app.get("io");
    await scheduleReminder(reminder, io);

    res.status(201).json({
      success: true,
      data: reminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Update a reminder
// @route   PUT /api/reminders/:id
// @access  Private
exports.updateReminder = async (req, res) => {
  try {
    let reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this reminder"
      });
    }

    // If updating the time, cancel existing schedule
    if (
      req.body.time &&
      reminder.time.toString() !== new Date(req.body.time).toString()
    ) {
      cancelReminder(reminder._id);
    }

    reminder = await Reminder.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    // Re-schedule if time was updated
    if (req.body.time) {
      const io = req.app.get("io");
      await scheduleReminder(reminder, io);
    }

    res.json({
      success: true,
      data: reminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Delete a reminder
// @route   DELETE /api/reminders/:id
// @access  Private
exports.deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this reminder"
      });
    }

    // Cancel the scheduled reminder
    cancelReminder(reminder._id);

    await reminder.deleteOne();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Mark a reminder as taken
// @route   PUT /api/reminders/:id/take
// @access  Private
exports.markReminderAsTaken = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this reminder"
      });
    }

    // Update reminder status
    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status: "taken",
        markedBy: req.user.id
      },
      { new: true }
    );

    // Cancel any scheduled reminders for this
    cancelReminder(reminder._id);

    res.json({
      success: true,
      data: updatedReminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Mark a reminder as missed
// @route   PUT /api/reminders/:id/miss
// @access  Private
exports.markReminderAsMissed = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this reminder"
      });
    }

    // Update reminder status
    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status: "missed",
        markedBy: req.user.id
      },
      { new: true }
    );

    // Cancel any scheduled reminders for this
    cancelReminder(reminder._id);

    // If marked by parent, no need to notify parent
    if (isParent) {
      await Reminder.findByIdAndUpdate(req.params.id, { parentNotified: true });
    }
    // If marked by user and has parent, notify parent
    else if (isOwner) {
      const user = await User.findById(reminder.user).populate("parent");

      if (user.parent && !reminder.parentNotified) {
        // Load medicine info for notification
        const populatedReminder = await Reminder.findById(req.params.id)
          .populate("medicine")
          .populate("user");

        const io = req.app.get("io");
        const parent = user.parent;

        // Create missed dose notification
        const missedNotification =
          formatMissedDoseNotification(populatedReminder);

        // Send push notification to parent
        if (parent.notificationPreferences.push) {
          sendPushNotification(io, parent._id.toString(), missedNotification);
        }

        // Update reminder to mark parent as notified
        await Reminder.findByIdAndUpdate(req.params.id, {
          parentNotified: true
        });
      }
    }

    res.json({
      success: true,
      data: updatedReminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Snooze a reminder
// @route   PUT /api/reminders/:id/snooze
// @access  Private
exports.snoozeReminder = async (req, res) => {
  try {
    const { minutes } = req.body;

    if (!minutes || minutes < 1) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid snooze minutes"
      });
    }

    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    // Make sure user owns the reminder or is parent of the reminder owner
    const isOwner = reminder.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, reminder.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to snooze this reminder"
      });
    }

    // Calculate new time
    const snoozedUntil = new Date();
    snoozedUntil.setMinutes(snoozedUntil.getMinutes() + parseInt(minutes));

    // Snooze the reminder
    const io = req.app.get("io");
    await snoozeReminder(reminder, snoozedUntil, io);

    // Get the updated reminder
    const updatedReminder = await Reminder.findById(req.params.id);

    res.json({
      success: true,
      data: updatedReminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get dashboard stats for user
// @route   GET /api/reminders/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Set default date range to last 30 days if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end);
    start.setDate(start.getDate() - 30); // default to last 30 days

    // Query for all reminders in date range
    const reminders = await Reminder.find({
      user: userId,
      time: { $gte: start, $lte: end }
    }).populate("medicine");

    // Calculate stats
    const total = reminders.length;
    const taken = reminders.filter((r) => r.status === "taken").length;
    const missed = reminders.filter((r) => r.status === "missed").length;
    const pending = reminders.filter((r) => r.status === "pending").length;
    const snoozed = reminders.filter((r) => r.status === "snoozed").length;

    // Calculate adherence score - 1 point per dose taken
    const adherenceScore = taken;

    // Calculate adherence rate as percentage
    const adherenceRate = total > 0 ? (taken / total) * 100 : 0;

    // Get statistics per medicine
    const medicineMap = {};
    reminders.forEach((reminder) => {
      const medId = reminder.medicine?._id.toString();
      if (!medId) return;

      if (!medicineMap[medId]) {
        medicineMap[medId] = {
          id: medId,
          name: reminder.medicine.name,
          total: 0,
          taken: 0,
          missed: 0,
          adherenceRate: 0
        };
      }

      medicineMap[medId].total += 1;
      if (reminder.status === "taken") {
        medicineMap[medId].taken += 1;
      } else if (reminder.status === "missed") {
        medicineMap[medId].missed += 1;
      }
    });

    // Calculate adherence rate for each medicine
    Object.values(medicineMap).forEach((med) => {
      med.adherenceRate = med.total > 0 ? (med.taken / med.total) * 100 : 0;
    });

    // Get streak info (consecutive days with all doses taken)
    const dateMap = {};
    reminders.forEach((reminder) => {
      const dateStr = reminder.time.toISOString().split("T")[0];
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { total: 0, taken: 0 };
      }
      dateMap[dateStr].total += 1;
      if (reminder.status === "taken") {
        dateMap[dateStr].taken += 1;
      }
    });

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date().toISOString().split("T")[0];
    let checkDate = new Date(today);

    while (true) {
      const dateStr = checkDate.toISOString().split("T")[0];
      const dayStats = dateMap[dateStr];

      // If day has no reminders or not all were taken, break
      if (!dayStats || dayStats.taken < dayStats.total) {
        break;
      }

      // If day has reminders and all were taken, increment streak
      if (dayStats.total > 0 && dayStats.taken === dayStats.total) {
        currentStreak += 1;
      }

      // Move to previous day
      checkDate.setDate(checkDate.getDate() - 1);

      // Stop if we've gone before the start date
      if (checkDate < start) {
        break;
      }
    }

    res.json({
      success: true,
      data: {
        overview: {
          totalReminders: total,
          takenCount: taken,
          missedCount: missed,
          pendingCount: pending,
          snoozedCount: snoozed,
          adherenceScore, // Points (1 per dose taken)
          adherenceRate: parseFloat(adherenceRate.toFixed(2)), // Percentage
          currentStreak // Days
        },
        medicineStats: Object.values(medicineMap)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get dashboard stats for a dependent
// @route   GET /api/reminders/dashboard/dependent/:dependentId
// @access  Private
exports.getDependentDashboardStats = async (req, res) => {
  try {
    const { dependentId } = req.params;
    const { startDate, endDate } = req.query;

    // Check if the requesting user is the parent of the dependent
    const dependent = await User.findById(dependentId);
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    if (dependent.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this dependent's data"
      });
    }

    // Set default date range to last 30 days if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end);
    start.setDate(start.getDate() - 30); // default to last 30 days

    // Query for all reminders in date range
    const reminders = await Reminder.find({
      user: dependentId,
      time: { $gte: start, $lte: end }
    }).populate("medicine");

    // Calculate stats
    const total = reminders.length;
    const taken = reminders.filter((r) => r.status === "taken").length;
    const missed = reminders.filter((r) => r.status === "missed").length;
    const pending = reminders.filter((r) => r.status === "pending").length;
    const snoozed = reminders.filter((r) => r.status === "snoozed").length;

    // Calculate adherence score - 1 point per dose taken
    const adherenceScore = taken;

    // Calculate adherence rate as percentage
    const adherenceRate = total > 0 ? (taken / total) * 100 : 0;

    // Get statistics per medicine
    const medicineMap = {};
    reminders.forEach((reminder) => {
      const medId = reminder.medicine?._id.toString();
      if (!medId) return;

      if (!medicineMap[medId]) {
        medicineMap[medId] = {
          id: medId,
          name: reminder.medicine.name,
          total: 0,
          taken: 0,
          missed: 0,
          adherenceRate: 0
        };
      }

      medicineMap[medId].total += 1;
      if (reminder.status === "taken") {
        medicineMap[medId].taken += 1;
      } else if (reminder.status === "missed") {
        medicineMap[medId].missed += 1;
      }
    });

    // Calculate adherence rate for each medicine
    Object.values(medicineMap).forEach((med) => {
      med.adherenceRate = med.total > 0 ? (med.taken / med.total) * 100 : 0;
    });

    // Get streak info (consecutive days with all doses taken)
    const dateMap = {};
    reminders.forEach((reminder) => {
      const dateStr = reminder.time.toISOString().split("T")[0];
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { total: 0, taken: 0 };
      }
      dateMap[dateStr].total += 1;
      if (reminder.status === "taken") {
        dateMap[dateStr].taken += 1;
      }
    });

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date().toISOString().split("T")[0];
    let checkDate = new Date(today);

    while (true) {
      const dateStr = checkDate.toISOString().split("T")[0];
      const dayStats = dateMap[dateStr];

      // If day has no reminders or not all were taken, break
      if (!dayStats || dayStats.taken < dayStats.total) {
        break;
      }

      // If day has reminders and all were taken, increment streak
      if (dayStats.total > 0 && dayStats.taken === dayStats.total) {
        currentStreak += 1;
      }

      // Move to previous day
      checkDate.setDate(checkDate.getDate() - 1);

      // Stop if we've gone before the start date
      if (checkDate < start) {
        break;
      }
    }

    res.json({
      success: true,
      data: {
        dependent: {
          id: dependent._id,
          name: dependent.name
        },
        overview: {
          totalReminders: total,
          takenCount: taken,
          missedCount: missed,
          pendingCount: pending,
          snoozedCount: snoozed,
          adherenceScore, // Points (1 per dose taken)
          adherenceRate: parseFloat(adherenceRate.toFixed(2)), // Percentage
          currentStreak // Days
        },
        medicineStats: Object.values(medicineMap)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Helper to check if a user is a parent of another user
const isParentOfUser = async (parentId, userId) => {
  try {
    const user = await User.findById(userId);
    return user && user.parent && user.parent.toString() === parentId;
  } catch (error) {
    return false;
  }
};

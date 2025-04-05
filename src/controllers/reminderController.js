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
const {
  getCurrentDateTime,
  subtractHoursToDate,
  addHoursToDate,
  convertIntoISTTime
} = require("../default/common");
const moment = require("moment-timezone");

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

    // Check if reminder time is past medicine end date
    if (
      medicine.endDate &&
      new Date(req.body.time) > new Date(medicine.endDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot schedule reminder after medicine end date"
      });
    }

    // Add user to req.body
    req.body.user = req.user.id;

    const reminder = await Reminder.create({
      user: req.body.user,
      medicine: req.body.medicine,
      time: moment.tz(req.body.time, "Asia/Kolkata").toDate(),
      repeat: req.body.repeat,
      repeatInterval: req.body.repeatInterval,
      repeatUnit: req.body.repeatUnit
    });

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

    // Check if reminder time is past medicine end date
    if (
      medicine.endDate &&
      new Date(req.body.time) > new Date(medicine.endDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot schedule reminder after medicine end date"
      });
    }

    // Add dependent as user to req.body
    req.body.user = dependentId;

    const reminder = await Reminder.create({
      user: req.body.user,
      medicine: req.body.medicine,
      time: moment.tz(req.body.time, "Asia/Kolkata").toDate(),
      repeat: req.body.repeat,
      repeatInterval: req.body.repeatInterval,
      repeatUnit: req.body.repeatUnit
    });

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

// @desc    Get dashboard statistics for a user
// @route   GET /api/reminders/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get today's reminders
    const todayReminders = await Reminder.find({
      user: userId,
      time: {
        $gte: new Date(getCurrentDateTime()),
        $lt: new Date(addHoursToDate(24))
      }
    }).populate("medicine");

    console.log(todayReminders)

    const upcomingReminders = await Reminder.find({
      user: userId,
      time: {
        $gt: new Date(addHoursToDate(24)),
        $lte: new Date(addHoursToDate(24 * 7))
      }
    }).populate("medicine");

    // Get all reminders from the past 30 days
    const pastReminders = await Reminder.find({
      user: userId,
      time: {
        $gte: new Date(subtractHoursToDate(24 * 30)),
        $lt: new Date(getCurrentDateTime())
      }
    }).populate("medicine");

    // Get missed reminders in the last 30 days
    const missedReminders = await Reminder.find({
      user: userId,
      time: {
        $gte: new Date(subtractHoursToDate(24 * 30)),
        $lt: new Date(getCurrentDateTime())
      },
      status: "missed"
    }).populate("medicine");

    // Calculate adherence stats
    const total = pastReminders.length;
    const taken = pastReminders.filter((r) => r.status === "taken").length;
    const missed = missedReminders.length;
    const adherenceRate = total > 0 ? (taken / total) * 100 : 100;

    res.json({
      success: true,
      data: {
        todayReminders,
        upcomingReminders,
        adherenceStats: {
          total,
          taken,
          missed,
          adherenceRate: Math.round(adherenceRate * 10) / 10
        },
        missedReminders
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

// @desc    Get dashboard statistics for a dependent
// @route   GET /api/reminders/dashboard/dependent/:dependentId
// @access  Private
exports.getDependentDashboardStats = async (req, res) => {
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
        message: "Not authorized to access this dependent's dashboard"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's reminders
    const todayReminders = await Reminder.find({
      user: dependentId,
      time: { $gte: today, $lt: tomorrow }
    }).populate("medicine");

    // Get upcoming reminders (next 7 days excluding today)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingReminders = await Reminder.find({
      user: dependentId,
      time: { $gt: tomorrow, $lte: nextWeek }
    }).populate("medicine");

    // Calculate adherence rate (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all reminders from the past 30 days
    const pastReminders = await Reminder.find({
      user: dependentId,
      time: { $gte: thirtyDaysAgo, $lt: today }
    }).populate("medicine");

    // Get missed reminders in the last 30 days
    const missedReminders = await Reminder.find({
      user: dependentId,
      time: { $gte: thirtyDaysAgo, $lt: today },
      status: "missed"
    }).populate("medicine");

    // Calculate adherence stats
    const total = pastReminders.length;
    const taken = pastReminders.filter((r) => r.status === "taken").length;
    const missed = missedReminders.length;
    const adherenceRate = total > 0 ? (taken / total) * 100 : 100;

    res.json({
      success: true,
      data: {
        todayReminders,
        upcomingReminders,
        adherenceStats: {
          total,
          taken,
          missed,
          adherenceRate: Math.round(adherenceRate * 10) / 10
        },
        missedReminders
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

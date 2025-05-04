const Reminder = require("../models/Reminder");
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const {
  scheduleReminder,
  cancelReminder,
  snoozeReminder: queueSnoozeReminder,
  scheduleUserReminders,
  scheduleRemindersInRange
} = require("../../utils/queueService");

const { addISTOffset } = require("../default/common");
const {
  scheduleRemindersInRange: queueServiceScheduleRemindersInRange
} = require("../../utils/queueService");
const mongoose = require("mongoose");

// Helper function to check if the user is a parent of another user
const isParentOfUser = async (parentId, childId) => {
  const parent = await User.findById(parentId);
  return parent && parent.dependents.includes(childId);
};

// @desc    Get all reminders for a user
// @route   GET /api/reminders
// @access  Private
exports.getReminders = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const queryObj = { user: req.user.id };

    // Add date range filter if provided
    if (startDate || endDate) {
      queryObj.time = {};
      if (startDate) queryObj.time.$gte = new Date(startDate);
      if (endDate) queryObj.time.$lte = new Date(endDate);
    }

    // Add status filter if provided
    if (status) {
      queryObj.status = status;
    }

    // Execute query
    const reminders = await Reminder.find({
      ...queryObj,
      time: { $gt: new Date() }
    })
      .populate({
        path: "medicine",
        select: "name id category dosage instructions"
      })
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

// @desc    Get single reminder
// @route   GET /api/reminders/:id
// @access  Private
exports.getReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

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

// @desc    Create new reminder
// @route   POST /api/reminders
// @access  Private
exports.createReminder = async (req, res) => {
  try {
    const {
      medicine_name,
      medicine_dosage,
      medicine_instructions,
      medicine_category,
      scheduleStart,
      scheduleEnd,
      frequency,
      customTimes,
      repeat,
      daysOfWeek,
      daysOfMonth,
      repeatInterval,
      repeatUnit
    } = req.body;

    let medicine;
    const is_medicine = await Medicine.find({
      name: medicine_name,
      user: req.user.id
    });
    if (is_medicine.length === 0) {
      medicine = await Medicine.create({
        name: medicine_name,
        user: req.user.id,
        dosage: medicine_dosage,
        instructions: medicine_instructions,
        category: medicine_category
      });
    }

    if (frequency === "custom" && customTimes.length > 0) {
      await Promise.all(
        customTimes.map(async (time) => {
          let reminderData = await Reminder.create({
            medicine: is_medicine.length > 0 ? is_medicine[0].id : medicine.id,
            user: req.user.id,
            scheduleStart: scheduleStart || new Date(),
            scheduleEnd: scheduleEnd || null,
            frequency,
            time: addISTOffset(new Date(time)),
            repeat: repeat || "none",
            daysOfWeek: daysOfWeek || [],
            daysOfMonth: daysOfMonth || [],
            repeatInterval: repeatInterval || 1,
            repeatUnit: repeatUnit || "days",
            active: true
          });
          scheduleReminder(
            reminderData._id.toString(),
            new Date(reminderData.time),
            1
          );
        })
      );
    } else {
      let reminderData = await Reminder.create({
        medicine: is_medicine.length > 0 ? is_medicine[0].id : medicine.id,
        user: req.user.id,
        scheduleStart: scheduleStart || new Date(),
        scheduleEnd: scheduleEnd || null,
        frequency,
        time: addISTOffset(new Date()),
        repeat: repeat || "none",
        daysOfWeek: daysOfWeek || [],
        daysOfMonth: daysOfMonth || [],
        repeatInterval: repeatInterval || 1,
        repeatUnit: repeatUnit || "days",
        active: true
      });
      scheduleReminder(reminderData._id, new Date(reminderData.time), 1);
    }
    scheduleRemindersInRange(
      addISTOffset(new Date()),
      addISTOffset(new Date(customTimes[customTimes.length - 1])),
      global.io,
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: "All the reminders are set."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Update reminder
// @route   PUT /api/reminders/:id
// @access  Private
exports.updateReminder = async (req, res) => {
  try {
    const {
      medicine_name,
      medicine_dosage,
      medicine_category,
      medicine_instructions,
      scheduleStart,
      scheduleEnd,
      active,
      frequency,
      repeat,
      daysOfWeek,
      daysOfMonth,
      repeatInterval,
      repeatUnit
    } = req.body;

    let reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found"
      });
    }

    let medicine;
    const is_medicine = await Medicine.find({ name: medicine_name });
    if (is_medicine.length === 0) {
      medicine = await Medicine.create({
        name: medicine_name,
        user: req.user.id,
        dosage: medicine_dosage,
        instructions: medicine_instructions,
        category: medicine_category
      });
    }

    // Check if user owns the reminder
    if (reminder.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this reminder"
      });
    }

    // Calculate next time if frequency or times are updated
    let nextTime = reminder.time;

    // Update the reminder
    reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        medicines: medicine || reminder.medicine,
        scheduleStart: scheduleStart || reminder.scheduleStart,
        scheduleEnd:
          scheduleEnd !== undefined ? scheduleEnd : reminder.scheduleEnd,
        active: active !== undefined ? active : reminder.active,
        frequency: frequency || reminder.frequency,
        time: nextTime,
        repeat: repeat || reminder.repeat,
        daysOfWeek: daysOfWeek !== undefined ? daysOfWeek : reminder.daysOfWeek,
        daysOfMonth:
          daysOfMonth !== undefined ? daysOfMonth : reminder.daysOfMonth,
        repeatInterval: repeatInterval || reminder.repeatInterval,
        repeatUnit: repeatUnit || reminder.repeatUnit
      },
      { new: true, runValidators: true }
    ).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

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

// @desc    Delete reminder
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

    // Check if user owns the reminder
    if (reminder.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this reminder"
      });
    }
    cancelReminder(req.params.id);
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

// @desc    Mark a medicine in a reminder as taken
// @route   PUT /api/reminders/:id/take
// @access  Private
exports.markMedicineAsTaken = async (req, res) => {
  try {
    const { id } = req.params;
    const reminder = await Reminder.findById(id).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

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
    if (reminder.status == "missed") {
      return res.status(400).json({
        success: false,
        message: "Reminder is missed"
      });
    }
    reminder.status = "taken";
    await reminder.save();

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

// @desc    Mark a medicine in a reminder as missed
// @route   PUT /api/reminders/:id/miss
// @access  Private
exports.markMedicineAsMissed = async (req, res) => {
  try {
    const { id } = req.params;
    const reminder = await Reminder.findById(id).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

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
    reminder.status = "missed";
    await reminder.save();

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

// @desc    Snooze a reminder
// @route   PUT /api/reminders/:id/snooze
// @access  Private
exports.snoozeReminder = async (req, res) => {
  try {
    const { minutes = 15 } = req.body;
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

    // Get the io instance
    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({
        success: false,
        message: "Socket.io instance not available"
      });
    }

    // Calculate snoozed time
    const now = new Date();
    const snoozedUntil = addISTOffset(
      new Date(now.getTime() + minutes * 60000)
    );

    // Update reminder in database with snoozed status
    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status: "snoozed",
        snoozedUntil
      },
      { new: true }
    ).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

    if (!updatedReminder) {
      return res.status(404).json({
        success: false,
        message: "Failed to update reminder"
      });
    }

    // Schedule the snoozed reminder in queue
    await queueSnoozeReminder(updatedReminder._id.toString(), snoozedUntil, io);

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

// @desc    Get reminders for a dependent
// @route   GET /api/reminders/dependent/:dependentId
// @access  Private
exports.getDependentReminders = async (req, res) => {
  try {
    const { dependentId } = req.params;
    const { startDate, endDate, status } = req.query;

    // Check if the current user is a parent of the dependent
    const parent = await User.findById(req.user.id);
    if (!parent.dependents.includes(dependentId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this dependent's reminders"
      });
    }

    // Build query
    const queryObj = { user: dependentId };

    // Add date range filter if provided
    if (startDate || endDate) {
      queryObj.time = {};
      if (startDate) queryObj.time.$gte = new Date(startDate);
      if (endDate) queryObj.time.$lte = new Date(endDate);
    }

    // Add status filter if provided
    if (status) {
      queryObj.status = status;
    }

    // Execute query
    const reminders = await Reminder.find(queryObj)
      .populate({
        path: "medicine",
        select: "name id category dosage instructions"
      })
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

// @desc    Create reminder for a dependent
// @route   POST /api/reminders/dependent/:dependentId
// @access  Private
exports.createReminderForDependent = async (req, res) => {
  try {
    const { dependentId } = req.params;
    const { medicines, time, repeat, repeatInterval, repeatUnit } = req.body;

    // Check if user is parent of dependent
    const parent = await User.findById(req.user.id);
    if (!parent.dependents.includes(dependentId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create reminder for this dependent"
      });
    }

    // Create reminder
    const reminder = await Reminder.create({
      medicines: medicines,
      user: dependentId,
      time,
      repeat: repeat || "none",
      repeatInterval: repeatInterval || 1,
      repeatUnit: repeatUnit || "days"
    });

    // Populate the created reminder for response
    const populatedReminder = await Reminder.findById(reminder._id).populate({
      path: "medicine",
      select: "name id category dosage instructions"
    });

    res.status(201).json({
      success: true,
      data: populatedReminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

async function dashboard(res, userId, date) {
  let today = new Date(date);
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  // Get user info
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  // Get reminder counts by status
  const reminderCountsByStatus = await Reminder.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        time: { $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  // Format reminder counts
  const reminderCounts = {
    taken: 0,
    missed: 0,
    pending: 0,
    total: 0
  };

  reminderCountsByStatus.forEach((stat) => {
    if (stat._id === "taken") reminderCounts.taken = stat.count;
    else if (stat._id === "missed") reminderCounts.missed = stat.count;
    else if (stat._id === "pending") reminderCounts.pending = stat.count;
    reminderCounts.total += stat.count;
  });

  // Get most medicines reminders set
  const mostTakenMedicines = await Reminder.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId)
        // status: "pending"
        // time: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: "$medicine",
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 5
    },
    {
      $lookup: {
        from: "medicines",
        localField: "_id",
        foreignField: "_id",
        as: "medicineDetails"
      }
    },
    {
      $unwind: "$medicineDetails"
    },
    {
      $project: {
        _id: 0,
        count: 1,
        name: "$medicineDetails.name",
        category: "$medicineDetails.category"
      }
    }
  ]);

  // Calculate streak points
  // A day is counted in streak if all reminders for that day were taken

  // Group reminders by date
  const remindersByDate = await Reminder.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        time: { $gte: new Date(user.streakChange) } // Filter from last streak update
      }
    },
    {
      $project: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$time" } },
        status: 1,
        allTaken: { $eq: ["$status", "taken"] }
      }
    },
    {
      $group: {
        _id: "$date",
        allRemindersForDayTaken: { $min: "$allTaken" }, // if any reminder has not all taken → false
        reminderCount: { $sum: 1 }
      }
    },
    {
      $match: {
        allRemindersForDayTaken: true // only keep days where all reminders were taken
      }
    },
    {
      $sort: { _id: 1 } // chronological order
    }
  ]);

  // Calculate current streak
  let streakCount = 0;
  today = new Date().toISOString().split("T")[0];

  // Create a set of dates with all reminders taken
  const completedDates = new Set();
  remindersByDate.forEach((day) => {
    if (day.allRemindersForDayTaken && day.reminderCount > 0) {
      completedDates.add(day._id);
    }
  });

  streakCount = completedDates.size;

  // Update user's streak count if the new count is higher than the existing one
  if (!user.streakCount || streakCount > user.streakCount) {
    await User.findByIdAndUpdate(userId, { streakCount });
  }

  return {
    data: {
      user: {
        name: user.name,
        email: user.email
      },
      reminderCounts,
      streakPoints: streakCount,
      mostTakenMedicines
    }
  };
}

// @desc    Get dashboard stats for a user
// @route   GET /api/reminders/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    const data = await dashboard(res, userId, date);
    return res.json({
      status: true,
      data: data.data
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
    const userId = req.user.id;
    const { dependentId } = req.params;
    const { date } = req.query;

    const data = await dashboard(res, dependentId, date);
    res.json({
      success: true,
      message:
        "Dependent dashboard stats endpoint (to be implemented with new model)",
      data: data.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Schedule reminders within a date range
// @route   POST /api/reminders/schedule
// @access  Private
exports.scheduleRemindersInDateRange = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.body;

    // Validate date inputs
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required"
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate date range
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid date format. Please use ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)"
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date must be before end date"
      });
    }

    // Get socket.io instance from app
    const io = req.app.get("io");

    if (!io) {
      return res.status(500).json({
        success: false,
        message: "Socket.io instance not available"
      });
    }

    // Optional user ID to filter reminders (admin functionality)
    // If not provided, use the authenticated user's ID or allow admins to access all reminders
    const targetUserId =
      userId && req.user.role === "admin"
        ? userId
        : userId
        ? userId === req.user.id
          ? userId
          : null
        : req.user.id;

    if (userId && !targetUserId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to schedule reminders for other users"
      });
    }

    // Schedule reminders in the date range using the queue service
    const count = await queueServiceScheduleRemindersInRange(
      start,
      end,
      io,
      targetUserId
    );

    res.json({
      success: true,
      message: `Scheduled ${count} reminders within the specified date range`,
      count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Schedule all active reminders for the authenticated user
// @route   POST /api/reminders/schedule/user
// @access  Private
exports.scheduleAllUserReminders = async (req, res) => {
  try {
    // Get socket.io instance from app
    const io = req.app.get("io");

    if (!io) {
      return res.status(500).json({
        success: false,
        message: "Socket.io instance not available"
      });
    }

    // Get user ID from the authenticated user
    const userId = req.user.id;

    // Schedule all active reminders for this user
    const count = await scheduleUserReminders(userId, io);

    res.json({
      success: true,
      message: `Scheduled ${count} reminders for user`,
      count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get all reminders with medicine details
// @route   GET /api/reminders/with-medicine-details
// @access  Private
exports.getRemindersWithMedicineDetails = async (req, res) => {
  try {
    const { status, date } = req.query;

    const today = new Date(date);
    const startOfDay = new Date(today.setHours(5, 30, 0, 0));
    const endOfDay = new Date(today.setHours(29, 29, 59, 999));

    // Execute query
    const reminders = await Reminder.find({
      user: req.user.id,
      time: { $gte: startOfDay, $lte: endOfDay }
    })
      .populate({
        path: "medicine",
        select: "name category dosage instructions"
      })
      .sort({ time: 1 });

    // Format response with required fields
    const formattedReminders = reminders.map((reminder) => {
      return {
        reminder_id: reminder._id,
        time: reminder.time.toISOString().split("T")[1].split(".")[0],
        status: reminder.status,
        medicine_name: reminder.medicine?.name || "Unknown",
        medicine_category: reminder.medicine?.category || "Unknown"
      };
    });

    res.json({
      success: true,
      count: formattedReminders.length,
      data: formattedReminders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

exports.removeDuplicateReminders = async (req, res, is_function) => {
  try {
    const duplicates = await Reminder.aggregate([
      {
        $group: {
          _id: { time: "$time", user: "$user" },
          ids: { $addToSet: "$_id" },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    for (const doc of duplicates) {
      const [keepId, ...deleteIds] = doc.ids;
      await Reminder.deleteMany({
        _id: { $in: deleteIds }
      });
    }
    if (is_function) {
      return console.log("Duplicate reminders removed successfully");
    } else {
      res.status(201).json({
        success: true,
        message: "Duplicate reminders removed successfully"
      });
    }
  } catch (error) {
    if (is_function) {
      return console.log("Error: Duplicate reminders removed unsuccessfully");
    } else {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }
};

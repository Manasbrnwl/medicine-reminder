const Reminder = require("../models/Reminder");
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const {
  scheduleReminder,
  cancelReminder,
  snoozeReminder: queueSnoozeReminder,
  scheduleUserReminders
} = require("../../utils/queueService");
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
const {
  scheduleRemindersInRange: queueServiceScheduleRemindersInRange
} = require("../../utils/queueService");

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
    const reminders = await Reminder.find(queryObj)
      .populate({
        path: "medicines.medicine",
        populate: {
          path: "medicineStack",
          select: "name description category"
        }
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
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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
      medicines,
      scheduleStart,
      scheduleEnd,
      frequency,
      standardTime,
      morningTime,
      eveningTime,
      afternoonTime,
      customTimes,
      repeat,
      daysOfWeek,
      daysOfMonth,
      repeatInterval,
      repeatUnit
    } = req.body;

    // Validate that medicines is an array of medicine IDs
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one medicine"
      });
    }

    // Check if all medicines exist and belong to the user
    const medicineEntities = await Promise.all(
      medicines.map((medicineId) => Medicine.findById(medicineId))
    );

    // for (let i = 0; i < medicineEntities.length; i++) {
    //   const medicine = medicineEntities[i];

    //   if (!medicine) {
    //     return res.status(404).json({
    //       success: false,
    //       message: `Medicine with ID ${medicines[i]} not found`
    //     });
    //   }

    //   if (medicine.user.toString() !== req.user.id) {
    //     return res.status(403).json({
    //       success: false,
    //       message: `Not authorized to add medicine with ID ${medicines[i]} to reminder`
    //     });
    //   }
    // }

    // Format medicines array for the reminder
    const medicinesArray = medicines.map((medicineId) => ({
      medicine: medicineId,
      status: "pending"
    }));

    // Validate frequency and required time fields
    if (!frequency) {
      return res.status(400).json({
        success: false,
        message: "Frequency is required"
      });
    }

    // Validate times based on frequency
    if (frequency === "once" && !standardTime) {
      return res.status(400).json({
        success: false,
        message: "Standard time is required for once frequency"
      });
    }

    if (frequency === "twice" && (!morningTime || !eveningTime)) {
      return res.status(400).json({
        success: false,
        message: "Morning and evening times are required for twice frequency"
      });
    }

    if (
      frequency === "thrice" &&
      (!morningTime || !afternoonTime || !eveningTime)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Morning, afternoon, and evening times are required for thrice frequency"
      });
    }

    if (
      frequency === "custom" &&
      (!customTimes || !Array.isArray(customTimes) || customTimes.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Custom times are required for custom frequency"
      });
    }

    // Validate repeat settings
    if (
      repeat === "weekly" &&
      (!daysOfWeek || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Days of week are required for weekly repeat"
      });
    }

    if (
      repeat === "monthly" &&
      (!daysOfMonth || !Array.isArray(daysOfMonth) || daysOfMonth.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Days of month are required for monthly repeat"
      });
    }

    if (repeat === "custom" && (!repeatInterval || !repeatUnit)) {
      return res.status(400).json({
        success: false,
        message: "Repeat interval and unit are required for custom repeat"
      });
    }

    // Calculate the next time for the reminder based on frequency
    let nextTime;
    if (frequency === "once") {
      nextTime = new Date(standardTime);
    } else if (frequency === "twice") {
      // Get the earlier of morning or evening time
      const morning = new Date(morningTime);
      const evening = new Date(eveningTime);
      nextTime = morning < evening ? morning : evening;
    } else if (frequency === "thrice") {
      // Get the earliest of morning, afternoon, or evening
      const morning = new Date(morningTime);
      const afternoon = new Date(afternoonTime);
      const evening = new Date(eveningTime);
      nextTime = Math.min(morning, afternoon, evening);
    } else if (frequency === "custom" && customTimes.length > 0) {
      // Sort custom times and get the earliest
      const sortedTimes = [...customTimes].sort(
        (a, b) => new Date(a.time) - new Date(b.time)
      );
      nextTime = new Date(sortedTimes[0].time);
    } else {
      nextTime = new Date(); // Fallback to current time
    }

    // Create reminder
    const reminder = await Reminder.create({
      medicines: medicinesArray,
      user: req.user.id,
      scheduleStart: scheduleStart || new Date(),
      scheduleEnd: scheduleEnd || null,
      frequency,
      standardTime: standardTime || null,
      morningTime: morningTime || null,
      eveningTime: eveningTime || null,
      afternoonTime: afternoonTime || null,
      customTimes: customTimes || [],
      time: nextTime,
      repeat: repeat || "none",
      daysOfWeek: daysOfWeek || [],
      daysOfMonth: daysOfMonth || [],
      repeatInterval: repeatInterval || 1,
      repeatUnit: repeatUnit || "days",
      active: true
    });

    // Populate the created reminder for response
    const populatedReminder = await Reminder.findById(reminder._id).populate({
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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

// @desc    Update reminder
// @route   PUT /api/reminders/:id
// @access  Private
exports.updateReminder = async (req, res) => {
  try {
    const {
      medicines,
      scheduleStart,
      scheduleEnd,
      active,
      frequency,
      standardTime,
      morningTime,
      eveningTime,
      afternoonTime,
      customTimes,
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

    // Check if user owns the reminder
    if (reminder.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this reminder"
      });
    }

    // Handle medicines update if provided
    let medicinesArray = reminder.medicines;
    if (medicines) {
      // Validate that medicines is an array of medicine IDs
      if (!Array.isArray(medicines) || medicines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please provide at least one medicine"
        });
      }

      // Check if all medicines exist and belong to the user
      const medicineEntities = await Promise.all(
        medicines.map((medicineId) => Medicine.findById(medicineId))
      );

      for (let i = 0; i < medicineEntities.length; i++) {
        const medicine = medicineEntities[i];

        if (!medicine) {
          return res.status(404).json({
            success: false,
            message: `Medicine with ID ${medicines[i]} not found`
          });
        }

        if (medicine.user.toString() !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: `Not authorized to add medicine with ID ${medicines[i]} to reminder`
          });
        }
      }

      // Format medicines array for the reminder
      medicinesArray = medicines.map((medicineId) => {
        // Check if medicine already exists in the reminder
        const existing = reminder.medicines.find(
          (m) => m.medicine.toString() === medicineId
        );
        if (existing) {
          return existing;
        }
        return {
          medicine: medicineId,
          status: "pending"
        };
      });
    }

    // Calculate next time if frequency or times are updated
    let nextTime = reminder.time;

    if (frequency) {
      if (frequency === "once" && standardTime) {
        nextTime = new Date(standardTime);
      } else if (frequency === "twice" && morningTime && eveningTime) {
        // Get the earlier of morning or evening time
        const morning = new Date(morningTime);
        const evening = new Date(eveningTime);
        nextTime = morning < evening ? morning : evening;
      } else if (
        frequency === "thrice" &&
        morningTime &&
        afternoonTime &&
        eveningTime
      ) {
        // Get the earliest of morning, afternoon, or evening
        const morning = new Date(morningTime);
        const afternoon = new Date(afternoonTime);
        const evening = new Date(eveningTime);
        nextTime = Math.min(morning, afternoon, evening);
      } else if (
        frequency === "custom" &&
        customTimes &&
        customTimes.length > 0
      ) {
        // Sort custom times and get the earliest
        const sortedTimes = [...customTimes].sort(
          (a, b) => new Date(a.time) - new Date(b.time)
        );
        nextTime = new Date(sortedTimes[0].time);
      }
    }

    // Update the reminder
    reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        medicines: medicinesArray,
        scheduleStart: scheduleStart || reminder.scheduleStart,
        scheduleEnd:
          scheduleEnd !== undefined ? scheduleEnd : reminder.scheduleEnd,
        active: active !== undefined ? active : reminder.active,
        frequency: frequency || reminder.frequency,
        standardTime:
          standardTime !== undefined ? standardTime : reminder.standardTime,
        morningTime:
          morningTime !== undefined ? morningTime : reminder.morningTime,
        eveningTime:
          eveningTime !== undefined ? eveningTime : reminder.eveningTime,
        afternoonTime:
          afternoonTime !== undefined ? afternoonTime : reminder.afternoonTime,
        customTimes:
          customTimes !== undefined ? customTimes : reminder.customTimes,
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
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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
// @route   PUT /api/reminders/:id/take/:medicineIndex
// @access  Private
exports.markMedicineAsTaken = async (req, res) => {
  try {
    const { id, medicineIndex } = req.params;
    const reminder = await Reminder.findById(id).populate({
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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

    // Check if the medicine index is valid
    if (medicineIndex < 0 || medicineIndex >= reminder.medicines.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid medicine index"
      });
    }

    // Mark the specific medicine as taken
    reminder.medicines[medicineIndex].status = "taken";
    reminder.medicines[medicineIndex].markedBy = req.user.id;
    reminder.medicines[medicineIndex].markedAt = new Date();

    // Update the reminder status based on medicines
    const allMedicineStatuses = reminder.medicines.map((m) => m.status);
    if (allMedicineStatuses.every((status) => status === "taken")) {
      reminder.status = "completed";
    } else if (allMedicineStatuses.some((status) => status === "taken")) {
      reminder.status = "partially_completed";
    }

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
// @route   PUT /api/reminders/:id/miss/:medicineIndex
// @access  Private
exports.markMedicineAsMissed = async (req, res) => {
  try {
    const { id, medicineIndex } = req.params;
    const reminder = await Reminder.findById(id).populate({
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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

    // Check if the medicine index is valid
    if (medicineIndex < 0 || medicineIndex >= reminder.medicines.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid medicine index"
      });
    }

    // Mark the specific medicine as missed
    reminder.medicines[medicineIndex].status = "missed";
    reminder.medicines[medicineIndex].markedBy = req.user.id;
    reminder.medicines[medicineIndex].markedAt = new Date();

    // Update the reminder status
    const allMedicineStatuses = reminder.medicines.map((m) => m.status);
    if (allMedicineStatuses.some((status) => status === "missed")) {
      reminder.status = "missed";
    }

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
    const snoozedUntil = new Date(now.getTime() + minutes * 60000);

    // Update reminder in database with snoozed status
    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status: "snoozed",
        snoozedUntil
      },
      { new: true }
    ).populate({
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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
        path: "medicines.medicine",
        populate: {
          path: "medicineStack",
          select: "name description category"
        }
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

    // Validate that medicines is an array of medicine IDs
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one medicine"
      });
    }

    // Check if all medicines exist and belong to the dependent
    const medicineEntities = await Promise.all(
      medicines.map((medicineId) => Medicine.findById(medicineId))
    );

    for (let i = 0; i < medicineEntities.length; i++) {
      const medicine = medicineEntities[i];

      if (!medicine) {
        return res.status(404).json({
          success: false,
          message: `Medicine with ID ${medicines[i]} not found`
        });
      }

      if (medicine.user.toString() !== dependentId) {
        return res.status(403).json({
          success: false,
          message: `Medicine with ID ${medicines[i]} does not belong to this dependent`
        });
      }
    }

    // Format medicines array for the reminder
    const medicinesArray = medicines.map((medicineId) => ({
      medicine: medicineId,
      status: "pending"
    }));

    // Create reminder
    const reminder = await Reminder.create({
      medicines: medicinesArray,
      user: dependentId,
      time,
      repeat: repeat || "none",
      repeatInterval: repeatInterval || 1,
      repeatUnit: repeatUnit || "days"
    });

    // Populate the created reminder for response
    const populatedReminder = await Reminder.findById(reminder._id).populate({
      path: "medicines.medicine",
      populate: {
        path: "medicineStack",
        select: "name description category"
      }
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

// Dashboard statistics calculation
// @desc    Get dashboard stats for a user
// @route   GET /api/reminders/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    // Implementation will need to be updated based on the new model
    // This is just a placeholder for now
    res.json({
      success: true,
      message: "Dashboard stats endpoint (to be implemented with new model)"
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
    // Implementation will need to be updated based on the new model
    // This is just a placeholder for now
    res.json({
      success: true,
      message:
        "Dependent dashboard stats endpoint (to be implemented with new model)"
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

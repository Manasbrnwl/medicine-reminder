const schedule = require("node-schedule");
const Reminder = require("../src/models/Reminder");
const User = require("../src/models/User");
const logger = require("./logger");
const { sendPushNotification } = require("./notifications");
const { sendReminderSMS, sendMissedDoseSMS } = require("./smsNotification");
const { getCurrentDateTime, addHoursToDate } = require("../src/default/common");

// Store all scheduled jobs
const scheduledJobs = {};

/**
 * Fetch reminders within a date range and schedule notifications
 * @param {Date} startDate - Start date for reminders
 * @param {Date} endDate - End date for reminders
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Array>} - Array of scheduled reminders
 */
const scheduleRemindersInRange = async (startDate, endDate, io) => {
  try {
    logger.info(
      `Fetching reminders between ${startDate} and ${endDate}`
    );

    // Find reminders within date range
    const reminders = await Reminder.find({
      time: { $gte: startDate, $lte: endDate },
      active: true,
      status: { $in: ["pending", "snoozed"] }
    })
      .populate({
        path: "medicines.medicine"
      })
      .populate("user");

    logger.info(`Found ${reminders.length} reminders to schedule`);

    // Cancel all existing jobs before rescheduling
    Object.keys(scheduledJobs).forEach((key) => {
      scheduledJobs[key].cancel();
      delete scheduledJobs[key];
    });

    // Schedule each reminder
    const scheduledReminders = [];
    for (const reminder of reminders) {
      await scheduleReminderNotification(reminder, io);
      scheduledReminders.push(reminder);
    }

    return scheduledReminders;
  } catch (error) {
    logger.error(`Error scheduling reminders in range: ${error.message}`);
    return [];
  }
};

/**
 * Schedule a single reminder notification
 * @param {Object} reminder - Reminder document
 * @param {Object} io - Socket.io instance
 */
const scheduleReminderNotification = async (reminder, io) => {
  try {
    if (!reminder) return;

    const jobId = reminder._id.toString();
    let reminderTime;

    // If reminder is snoozed, use snoozed time
    if (reminder.status === "snoozed" && reminder.snoozedUntil) {
      reminderTime = new Date(reminder.snoozedUntil);
    } else {
      reminderTime = new Date(reminder.time);
    }

    // Don't schedule if time is in the past
    if (reminderTime < new Date()) {
      logger.warn(`Reminder ${jobId} time is in the past, skipping`);
      return;
    }

    // Cancel existing job if any
    if (scheduledJobs[jobId]) {
      scheduledJobs[jobId].cancel();
    }

    // Schedule the notification job
    const job = schedule.scheduleJob(reminderTime, async () => {
      try {
        await sendNotifications(reminder, io);
        await scheduleMissedDoseCheck(reminder, io);

        // For recurring reminders, schedule the next occurrence
        if (reminder.repeat !== "none" && reminder.scheduleEnd) {
          const scheduleEnd = new Date(reminder.scheduleEnd);
          if (scheduleEnd > new Date()) {
            await scheduleNextRecurrence(reminder, io);
          }
        }
      } catch (notificationError) {
        logger.error(
          `Error in scheduled job for reminder ${jobId}: ${notificationError.message}`
        );
      }
    });

    // Store job reference
    scheduledJobs[jobId] = job;
  } catch (error) {
    logger.error(
      `Error scheduling reminder ${reminder?._id}: ${error.message}`
    );
  }
};

/**
 * Send notifications for a reminder via all enabled channels
 * @param {Object} reminder - Reminder document
 * @param {Object} io - Socket.io instance
 */
const sendNotifications = async (reminder, io) => {
  try {
    const user = reminder.user;
    if (!user) {
      logger.error(`User not found for reminder ${reminder._id}`);
      return;
    }

    // Format notification
    const notification = formatNotification(reminder);

    // Send socket.io push notification
    if (user.notificationPreferences?.push) {
      sendPushNotification(io, user._id.toString(), notification);
      logger.info(`Push notification sent to user ${user._id}`);
    }

    // Send SMS notification
    if (user.notificationPreferences?.sms && user.phone) {
      await sendReminderSMS(user, reminder);
      logger.info(`SMS notification sent to ${user.phone}`);
    }

    // Update reminder status
    await Reminder.findByIdAndUpdate(reminder._id, {
      notificationSent: true,
      notificationCount: (reminder.notificationCount || 0) + 1
    });
  } catch (error) {
    logger.error(`Error sending notifications: ${error.message}`);
  }
};

/**
 * Format notification object for socket.io
 * @param {Object} reminder - Reminder document
 * @returns {Object} - Notification object
 */
const formatNotification = (reminder) => {
  // Extract medicine names
  const medicineNames = reminder.medicines
    .map((med) => med.medicine?.medicineStack?.name || "unknown medicine")
    .join(", ");

  // Format time
  const timeFormatted = new Date(reminder.time).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return {
    title: `Medicine Reminder`,
    body: `It's time to take ${medicineNames} at ${timeFormatted}`,
    data: {
      reminderId: reminder._id,
      medicines: reminder.medicines.map((med) => ({
        id: med.medicine?._id,
        name: med.medicine?.medicineStack?.name
      })),
      time: reminder.time
    }
  };
};

/**
 * Schedule check for missed doses
 * @param {Object} reminder - Reminder document
 * @param {Object} io - Socket.io instance
 */
const scheduleMissedDoseCheck = async (reminder, io) => {
  try {
    // Set check time to 30 minutes after reminder time
    const checkTime = new Date();
    checkTime.setMinutes(checkTime.getMinutes() + 30);

    const jobId = `missed_${reminder._id}`;

    // Cancel existing check if any
    if (scheduledJobs[jobId]) {
      scheduledJobs[jobId].cancel();
    }

    // Schedule the missed dose check job
    const job = schedule.scheduleJob(checkTime, async () => {
      try {
        // Reload reminder to get current status
        const currentReminder = await Reminder.findById(reminder._id)
          .populate({
            path: "medicines.medicine",
          })
          .populate("user");

        if (!currentReminder) return;

        // Check if any medicines are still pending
        const hasPendingMedicines = currentReminder.medicines.some(
          (med) => med.status === "pending"
        );

        if (hasPendingMedicines) {
          // Mark reminder as missed
          await Reminder.findByIdAndUpdate(reminder._id, {
            status: "missed"
          });

          // Notify parent if exists and not already notified
          if (currentReminder.user?.parent && !currentReminder.parentNotified) {
            await notifyParent(currentReminder, io);
          }
        }
      } catch (error) {
        logger.error(`Error checking missed dose: ${error.message}`);
      }
    });

    // Store job reference
    scheduledJobs[jobId] = job;
    logger.info(
      `Scheduled missed dose check for reminder ${
        reminder._id
      } at ${checkTime.toISOString()}`
    );
  } catch (error) {
    logger.error(`Error scheduling missed dose check: ${error.message}`);
  }
};

/**
 * Notify parent of missed dose
 * @param {Object} reminder - Reminder document
 * @param {Object} io - Socket.io instance
 */
const notifyParent = async (reminder, io) => {
  try {
    const parent = await User.findById(reminder.user.parent);
    if (!parent) return;

    // Format notification for parent
    const notification = {
      title: "Missed Dose Alert",
      body: `${reminder.user.name} missed their dose of ${reminder.medicines
        .map((med) => med.medicine?.medicineStack?.name)
        .join(", ")}`,
      data: {
        reminderId: reminder._id,
        dependentId: reminder.user._id,
        time: reminder.time
      }
    };

    // Send push notification to parent
    if (parent.notificationPreferences?.push) {
      sendPushNotification(io, parent._id.toString(), notification);
    }

    // Send SMS to parent
    if (parent.notificationPreferences?.sms && parent.phone) {
      await sendMissedDoseSMS(parent, reminder);
    }

    // Update reminder to indicate parent was notified
    await Reminder.findByIdAndUpdate(reminder._id, {
      parentNotified: true
    });

    logger.info(
      `Parent ${parent._id} notified about missed dose for reminder ${reminder._id}`
    );
  } catch (error) {
    logger.error(`Error notifying parent: ${error.message}`);
  }
};

/**
 * Schedule next occurrence for recurring reminder
 * @param {Object} reminder - Reminder document
 * @param {Object} io - Socket.io instance
 */
const scheduleNextRecurrence = async (reminder, io) => {
  try {
    // Calculate next time based on frequency and repeat pattern
    const nextTime = calculateNextTime(reminder);

    // Stop if next time is after schedule end date
    if (reminder.scheduleEnd && nextTime > new Date(reminder.scheduleEnd)) {
      logger.info(
        `Reminder ${reminder._id} has reached its end date, no more occurrences`
      );
      return;
    }

    // Create new reminder for next occurrence
    const medicinesArray = reminder.medicines.map((med) => ({
      medicine: med.medicine._id,
      status: "pending"
    }));

    const newReminder = new Reminder({
      medicines: medicinesArray,
      user: reminder.user._id,
      scheduleStart: reminder.scheduleStart,
      scheduleEnd: reminder.scheduleEnd,
      frequency: reminder.frequency,
      standardTime: reminder.standardTime,
      morningTime: reminder.morningTime,
      afternoonTime: reminder.afternoonTime,
      eveningTime: reminder.eveningTime,
      customTimes: reminder.customTimes,
      time: nextTime,
      repeat: reminder.repeat,
      daysOfWeek: reminder.daysOfWeek,
      daysOfMonth: reminder.daysOfMonth,
      repeatInterval: reminder.repeatInterval,
      repeatUnit: reminder.repeatUnit,
      active: true
    });

    // Save and schedule the new reminder
    const savedReminder = await newReminder.save();
    await scheduleReminderNotification(
      await Reminder.findById(savedReminder._id)
        .populate({
          path: "medicines.medicine",
        })
        .populate("user"),
      io
    );

    logger.info(
      `Created and scheduled next occurrence for reminder ${
        reminder._id
      } at ${nextTime.toISOString()}`
    );
  } catch (error) {
    logger.error(`Error scheduling next recurrence: ${error.message}`);
  }
};

/**
 * Calculate next time for recurring reminder
 * @param {Object} reminder - Reminder document
 * @returns {Date} - Next reminder time
 */
const calculateNextTime = (reminder) => {
  const currentTime = new Date(reminder.time);
  let nextTime = new Date(currentTime);

  switch (reminder.repeat) {
    case "daily":
      nextTime.setDate(nextTime.getDate() + 1);
      break;

    case "weekly":
      if (
        Array.isArray(reminder.daysOfWeek) &&
        reminder.daysOfWeek.length > 0
      ) {
        // Find next day of week
        const currentDayOfWeek = currentTime.getDay();
        const sortedDays = [...reminder.daysOfWeek].sort();

        // Find next available day
        const nextDay = sortedDays.find((day) => day > currentDayOfWeek);

        if (nextDay !== undefined) {
          // Next day is in current week
          const daysToAdd = nextDay - currentDayOfWeek;
          nextTime.setDate(nextTime.getDate() + daysToAdd);
        } else {
          // Next day is in next week
          const daysToAdd = 7 - currentDayOfWeek + sortedDays[0];
          nextTime.setDate(nextTime.getDate() + daysToAdd);
        }
      } else {
        // Default to next week if no days specified
        nextTime.setDate(nextTime.getDate() + 7);
      }
      break;

    case "monthly":
      if (
        Array.isArray(reminder.daysOfMonth) &&
        reminder.daysOfMonth.length > 0
      ) {
        const currentDay = currentTime.getDate();
        const currentMonth = currentTime.getMonth();
        const currentYear = currentTime.getFullYear();
        const sortedDays = [...reminder.daysOfMonth].sort((a, b) => a - b);

        // Find next day of month
        const nextDay = sortedDays.find((day) => day > currentDay);

        if (nextDay !== undefined) {
          // Next day is in current month
          nextTime = new Date(
            currentYear,
            currentMonth,
            nextDay,
            currentTime.getHours(),
            currentTime.getMinutes()
          );
        } else {
          // Next day is in next month
          nextTime = new Date(
            currentYear,
            currentMonth + 1,
            sortedDays[0],
            currentTime.getHours(),
            currentTime.getMinutes()
          );
        }
      } else {
        // Default to next month same day
        nextTime.setMonth(nextTime.getMonth() + 1);
      }
      break;

    case "custom":
      if (reminder.repeatInterval && reminder.repeatUnit) {
        switch (reminder.repeatUnit) {
          case "hours":
            nextTime.setHours(nextTime.getHours() + reminder.repeatInterval);
            break;
          case "days":
            nextTime.setDate(nextTime.getDate() + reminder.repeatInterval);
            break;
          case "weeks":
            nextTime.setDate(nextTime.getDate() + reminder.repeatInterval * 7);
            break;
          case "months":
            nextTime.setMonth(nextTime.getMonth() + reminder.repeatInterval);
            break;
        }
      }
      break;

    default:
      // No repeat, keep original time
      break;
  }

  return nextTime;
};

/**
 * Initialize and schedule all active upcoming reminders
 * @param {Object} io - Socket.io instance
 */
const initializeReminders = async (io) => {
  try {
    // Schedule reminders in the next 7 days
    const scheduledReminders = await scheduleRemindersInRange(getCurrentDateTime(), addHoursToDate(24*7), io);

    logger.info(
      `Initialized ${scheduledReminders.length} reminders for the next 7 days`
    );
    return scheduledReminders;
  } catch (error) {
    logger.error(`Error initializing reminders: ${error.message}`);
    return [];
  }
};

/**
 * Cancel all scheduled jobs
 */
const cancelAllJobs = () => {
  try {
    const jobCount = Object.keys(scheduledJobs).length;

    // Cancel each job
    Object.keys(scheduledJobs).forEach((key) => {
      scheduledJobs[key].cancel();
      delete scheduledJobs[key];
    });

    logger.info(`Cancelled ${jobCount} scheduled jobs`);
  } catch (error) {
    logger.error(`Error cancelling jobs: ${error.message}`);
  }
};

/**
 * Cancel a specific reminder job
 * @param {string} reminderId - Reminder ID to cancel
 */
const cancelReminder = (reminderId) => {
  try {
    const jobId = reminderId.toString();
    const missedJobId = `missed_${jobId}`;

    // Cancel main job
    if (scheduledJobs[jobId]) {
      scheduledJobs[jobId].cancel();
      delete scheduledJobs[jobId];
    }

    // Cancel missed dose check job
    if (scheduledJobs[missedJobId]) {
      scheduledJobs[missedJobId].cancel();
      delete scheduledJobs[missedJobId];
    }

    logger.info(`Cancelled reminder ${reminderId}`);
  } catch (error) {
    logger.error(`Error cancelling reminder ${reminderId}: ${error.message}`);
  }
};

/**
 * Reschedule a snoozed reminder
 * @param {string} reminderId - Reminder ID
 * @param {number} minutes - Minutes to snooze
 * @param {Object} io - Socket.io instance
 */
const snoozeReminder = async (reminderId, minutes, io) => {
  try {
    // Calculate snoozed time
    const now = new Date();
    const snoozedUntil = new Date(now.getTime() + minutes * 60000);

    // Update reminder with snoozed status and time
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminderId,
      {
        status: "snoozed",
        snoozedUntil
      },
      { new: true }
    )
      .populate({
        path: "medicines.medicine"
      })
      .populate("user");

    if (!updatedReminder) {
      logger.error(`Reminder ${reminderId} not found for snooze`);
      return null;
    }

    // Cancel existing jobs and reschedule
    cancelReminder(reminderId);
    await scheduleReminderNotification(updatedReminder, io);

    logger.info(
      `Snoozed reminder ${reminderId} until ${snoozedUntil.toISOString()}`
    );
    return updatedReminder;
  } catch (error) {
    logger.error(`Error snoozing reminder ${reminderId}: ${error.message}`);
    return null;
  }
};

module.exports = {
  scheduleRemindersInRange,
  initializeReminders,
  cancelReminder,
  cancelAllJobs,
  snoozeReminder
};

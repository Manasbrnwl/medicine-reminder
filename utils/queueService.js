const Bull = require("bull");
const logger = require("./logger");
const Reminder = require("../src/models/Reminder");
const { sendPushNotification } = require("./notifications");
const { sendReminderSMS, sendMissedDoseSMS } = require("./smsNotification");

// Redis connection configuration from environment variables
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD
  }
};

// Create queues for different types of jobs
const reminderQueue = new Bull("medication-reminders", redisConfig);
const missedDoseQueue = new Bull("missed-dose-checks", redisConfig);
const recurringReminderQueue = new Bull("recurring-reminders", redisConfig);

// Process reminder notifications
reminderQueue.process(async (job) => {
  try {
    const { reminderId } = job.data;
    logger.info(`Processing reminder job for reminder: ${reminderId}`);

    // Fetch the reminder with all necessary data
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "medicines.medicine",
        populate: {
          path: "medicineStack",
          select: "name description category"
        }
      })
      .populate("user");

    if (!reminder) {
      logger.warn(`Reminder ${reminderId} not found, skipping notification`);
      return { success: false, reason: "reminder_not_found" };
    }

    // Check if reminder is still active and pending
    if (!reminder.active || reminder.status !== "pending") {
      logger.info(
        `Reminder ${reminderId} is no longer active or pending, skipping`
      );
      return { success: false, reason: "reminder_inactive_or_completed" };
    }

    // Send notifications using the socket.io instance from job data
    await sendNotifications(reminder, job.data.io);

    // Schedule missed dose check
    await scheduleMissedDoseCheck(reminder, job.data.io);

    // Schedule next occurrence if it's a recurring reminder
    if (reminder.repeat !== "none" && reminder.scheduleEnd) {
      await scheduleNextRecurrence(reminder, job.data.io);
    }

    return { success: true };
  } catch (error) {
    logger.error(`Error processing reminder job: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Process missed dose checks
missedDoseQueue.process(async (job) => {
  try {
    const { reminderId } = job.data;
    logger.info(`Processing missed dose check for reminder: ${reminderId}`);

    // Reload reminder to get current status
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "medicines.medicine",
        populate: {
          path: "medicineStack",
          select: "name description category"
        }
      })
      .populate("user");

    if (!reminder) {
      logger.warn(
        `Reminder ${reminderId} not found, skipping missed dose check`
      );
      return { success: false, reason: "reminder_not_found" };
    }

    // Check if any medicines are still pending
    const hasPendingMedicines = reminder.medicines.some(
      (med) => med.status === "pending"
    );

    if (hasPendingMedicines) {
      // Mark reminder as missed
      await Reminder.findByIdAndUpdate(reminderId, {
        status: "missed"
      });

      // Notify parent if exists and not already notified
      if (reminder.user?.parent && !reminder.parentNotified) {
        await notifyParent(reminder, job.data.io);
      }
    }

    return { success: true };
  } catch (error) {
    logger.error(`Error processing missed dose check: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Process recurring reminder creation
recurringReminderQueue.process(async (job) => {
  try {
    const { reminderId } = job.data;
    logger.info(`Creating next occurrence for reminder: ${reminderId}`);

    // Fetch the original reminder
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "medicines.medicine",
        populate: {
          path: "medicineStack",
          select: "name description category"
        }
      })
      .populate("user");

    if (!reminder) {
      logger.warn(
        `Reminder ${reminderId} not found, cannot create next occurrence`
      );
      return { success: false, reason: "reminder_not_found" };
    }

    // Create next occurrence based on reminder pattern
    const result = await createNextOccurrence(reminder, job.data.io);
    return { success: true, nextReminderId: result?.reminderId };
  } catch (error) {
    logger.error(`Error creating recurring reminder: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Send notifications for a reminder via all enabled channels
async function sendNotifications(reminder, io) {
  try {
    const user = reminder.user;
    if (!user) {
      logger.error(`User not found for reminder ${reminder._id}`);
      return false;
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

    return true;
  } catch (error) {
    logger.error(`Error sending notifications: ${error.message}`);
    return false;
  }
}

// Format notification object for socket.io
function formatNotification(reminder) {
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
}

// Schedule a check for missed doses
async function scheduleMissedDoseCheck(reminder, io) {
  try {
    // Set check time to 30 minutes after reminder time
    const checkTime = new Date();
    checkTime.setMinutes(checkTime.getMinutes() + 30);

    // Calculate delay in milliseconds
    const delay = Math.max(0, checkTime.getTime() - Date.now());

    // Add to missed dose queue with delay
    await missedDoseQueue.add(
      {
        reminderId: reminder._id.toString(),
        io
      },
      {
        delay,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60000 // 1 minute
        },
        removeOnComplete: true
      }
    );

    logger.info(
      `Scheduled missed dose check for reminder ${
        reminder._id
      } at ${checkTime.toISOString()}`
    );
    return true;
  } catch (error) {
    logger.error(`Error scheduling missed dose check: ${error.message}`);
    return false;
  }
}

// Notify parent of missed dose
async function notifyParent(reminder, io) {
  try {
    const User = require("../src/models/User");
    const parent = await User.findById(reminder.user.parent);

    if (!parent) return false;

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
    return true;
  } catch (error) {
    logger.error(`Error notifying parent: ${error.message}`);
    return false;
  }
}

// Schedule next occurrence of recurring reminder
async function scheduleNextRecurrence(reminder, io) {
  try {
    // Add job to create next occurrence
    await recurringReminderQueue.add(
      {
        reminderId: reminder._id.toString(),
        io
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60000 // 1 minute
        },
        removeOnComplete: true
      }
    );

    logger.info(
      `Queued job to create next occurrence of reminder ${reminder._id}`
    );
    return true;
  } catch (error) {
    logger.error(`Error scheduling next recurrence: ${error.message}`);
    return false;
  }
}

// Create next reminder occurrence
async function createNextOccurrence(reminder, io) {
  try {
    // Calculate next time based on frequency and repeat pattern
    const nextTime = calculateNextTime(reminder);

    // Stop if next time is after schedule end date
    if (reminder.scheduleEnd && nextTime > new Date(reminder.scheduleEnd)) {
      logger.info(
        `Reminder ${reminder._id} has reached its end date, no more occurrences`
      );
      return null;
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

    // Save the new reminder
    const savedReminder = await newReminder.save();

    // Schedule the notification
    await scheduleReminder(savedReminder._id, nextTime, io);

    logger.info(
      `Created and scheduled next occurrence for reminder ${
        reminder._id
      } at ${nextTime.toISOString()}`
    );
    return { success: true, reminderId: savedReminder._id };
  } catch (error) {
    logger.error(`Error creating next occurrence: ${error.message}`);
    return null;
  }
}

// Calculate next time for recurring reminder
function calculateNextTime(reminder) {
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
}

// Schedule a reminder notification
async function scheduleReminder(reminderId, reminderTime, io) {
  try {
    // Make sure reminderTime is in the future
    if (reminderTime <= new Date()) {
      logger.warn(`Reminder time for ${reminderId} is in the past, skipping`);
      return false;
    }

    // Calculate delay in milliseconds
    const delay = reminderTime.getTime() - Date.now();

    // Add to reminder queue with delay
    await reminderQueue.add(
      {
        reminderId: reminderId.toString(),
        io
      },
      {
        delay,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60000 // 1 minute
        },
        removeOnComplete: true
      }
    );

    logger.info(
      `Scheduled reminder ${reminderId} for ${reminderTime.toISOString()}`
    );
    return true;
  } catch (error) {
    logger.error(`Error scheduling reminder: ${error.message}`);
    return false;
  }
}

// Schedule reminders within a date range
async function scheduleRemindersInRange(startDate, endDate, io, userId = null) {
  try {
    logger.info(
      `Fetching reminders between ${startDate.toISOString()} and ${endDate.toISOString()}`
    );

    // Build query for reminders within date range
    const query = {
      time: { $gte: startDate, $lte: endDate },
      active: true,
      status: { $in: ["pending", "snoozed"] }
    };

    // Add user filter if provided
    if (userId) {
      query.user = userId;
    }

    // Process reminders in batches to avoid memory issues
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;
    let totalScheduled = 0;

    // Process in batches
    while (hasMore) {
      // Find batch of reminders
      const reminders = await Reminder.find(query)
        .sort({ time: 1 })
        .skip(skip)
        .limit(batchSize)
        .lean();

      if (reminders.length < batchSize) {
        hasMore = false;
      }

      logger.info(
        `Found ${reminders.length} reminders in batch starting at ${skip}`
      );

      // Schedule each reminder in the batch
      for (const reminder of reminders) {
        let reminderTime;

        // Use snoozed time if available
        if (reminder.status === "snoozed" && reminder.snoozedUntil) {
          reminderTime = new Date(reminder.snoozedUntil);
        } else {
          reminderTime = new Date(reminder.time);
        }

        // Only schedule if time is in the future
        if (reminderTime > new Date()) {
          await scheduleReminder(reminder._id, reminderTime, io);
          totalScheduled++;
        }
      }

      skip += batchSize;
    }

    logger.info(
      `Scheduled ${totalScheduled} reminders between ${startDate.toISOString()} and ${endDate.toISOString()}`
    );
    return totalScheduled;
  } catch (error) {
    logger.error(`Error scheduling reminders in range: ${error.message}`);
    return 0;
  }
}

// Initialize reminders for upcoming period
async function initializeReminders(io) {
  try {
    // Get current date
    const now = new Date();

    // Set end date to 2 days from now initially (to avoid overloading)
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 2);

    // Schedule reminders for the next 2 days
    const scheduledCount = await scheduleRemindersInRange(now, endDate, io);

    logger.info(`Initialized ${scheduledCount} reminders for the next 2 days`);
    return scheduledCount;
  } catch (error) {
    logger.error(`Error initializing reminders: ${error.message}`);
    return 0;
  }
}

// Clean up all queues
async function cleanupQueues() {
  try {
    await reminderQueue.empty();
    await missedDoseQueue.empty();
    await recurringReminderQueue.empty();
    logger.info("All queues emptied successfully");
    return true;
  } catch (error) {
    logger.error(`Error cleaning up queues: ${error.message}`);
    return false;
  }
}

// Pause all queue processing
async function pauseQueues() {
  try {
    await reminderQueue.pause();
    await missedDoseQueue.pause();
    await recurringReminderQueue.pause();
    logger.info("All queues paused");
    return true;
  } catch (error) {
    logger.error(`Error pausing queues: ${error.message}`);
    return false;
  }
}

// Resume all queue processing
async function resumeQueues() {
  try {
    await reminderQueue.resume();
    await missedDoseQueue.resume();
    await recurringReminderQueue.resume();
    logger.info("All queues resumed");
    return true;
  } catch (error) {
    logger.error(`Error resuming queues: ${error.message}`);
    return false;
  }
}

// Get queues status
async function getQueuesStatus() {
  try {
    const [reminderCount, missedDoseCount, recurringCount] = await Promise.all([
      reminderQueue.getJobCounts(),
      missedDoseQueue.getJobCounts(),
      recurringReminderQueue.getJobCounts()
    ]);

    return {
      reminderQueue: reminderCount,
      missedDoseQueue: missedDoseCount,
      recurringReminderQueue: recurringCount
    };
  } catch (error) {
    logger.error(`Error getting queue status: ${error.message}`);
    return null;
  }
}

/**
 * Schedule all active reminders for a specific user
 * @param {string} userId - User ID to schedule reminders for
 * @param {Object} io - Socket.io instance
 * @returns {Promise<number>} - Number of scheduled reminders
 */
async function scheduleUserReminders(userId, io) {
  try {
    logger.info(`Scheduling reminders for user ${userId}`);

    // Get current date
    const now = new Date();

    // Set end date to 30 days from now (to cover monthly medications)
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    // Schedule this user's reminders
    const count = await scheduleRemindersInRange(now, endDate, io, userId);

    logger.info(`Scheduled ${count} reminders for user ${userId}`);
    return count;
  } catch (error) {
    logger.error(
      `Error scheduling reminders for user ${userId}: ${error.message}`
    );
    return 0;
  }
}

module.exports = {
  reminderQueue,
  missedDoseQueue,
  recurringReminderQueue,
  scheduleReminder,
  scheduleRemindersInRange,
  scheduleUserReminders,
  initializeReminders,
  cleanupQueues,
  pauseQueues,
  resumeQueues,
  getQueuesStatus
};

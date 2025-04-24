const Bull = require("bull");
const logger = require("./logger");
const Reminder = require("../src/models/Reminder");
const { sendPushNotification } = require("./notifications");
const { sendReminderSMS, sendMissedDoseSMS } = require("./smsNotification");
const { getRedisClient } = require("../config/redis");
const { getCurrentDateTime, addHoursToDate } = require("../src/default/common");

// Redis connection configuration using URL
const redisConfig = {
  redis: process.env.REDIS_URL,
  settings: {
    lockDuration: 30000,
    stalledInterval: 30000,
    maxStalledCount: 1
  },
  limiter: {
    max: 1000,
    duration: 5000
  },
  tls: {
    rejectUnauthorized: false // Allow self-signed certificates
  }
};

// Create queues for different types of jobs
let reminderQueue, missedDoseQueue, recurringReminderQueue;

// Global socket.io instance
let globalIo = null;

// Set the global socket.io instance
const setSocketIo = (io) => {
  globalIo = io;
  logger.info("Socket.IO instance set globally");
};

// Initialize queues
const initializeQueues = () => {
  try {
    logger.info("Initializing Bull queues...");

    reminderQueue = new Bull("medication-reminders", redisConfig);
    missedDoseQueue = new Bull("missed-dose-checks", redisConfig);
    recurringReminderQueue = new Bull("recurring-reminders", redisConfig);

    // Add error handlers for each queue
    [reminderQueue, missedDoseQueue, recurringReminderQueue].forEach(
      (queue) => {
        queue.on("error", (error) => {
          logger.error(`Queue ${queue.name} error: ${error.message}`);
        });

        queue.on("failed", (job, error) => {
          logger.error(
            `Job ${job.id} in queue ${queue.name} failed: ${error.message}`
          );
        });

        queue.on("stalled", (job) => {
          logger.warn(`Job ${job.id} in queue ${queue.name} has stalled`);
        });
      }
    );

    logger.info("Bull queues initialized successfully");
    return true;
  } catch (error) {
    logger.error(`Failed to initialize Bull queues: ${error.message}`);
    return false;
  }
};

// Initialize queues immediately
initializeQueues();

// Process reminder notifications
reminderQueue.process(async (job) => {
  try {
    const { reminderId } = job.data;
    logger.info(`Processing reminder job for reminder: ${reminderId}`);

    // Fetch the reminder with all necessary data
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "medicine",
        select: "name id category dosage instructions"
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

    // Send notifications using the global socket.io instance
    await sendNotifications(reminder, globalIo);

    // Schedule missed dose check
    await scheduleMissedDoseCheck(reminder, globalIo);

    // Schedule next occurrence if it's a recurring reminder
    if (reminder.repeat !== "none" && reminder.scheduleEnd) {
      await scheduleNextRecurrence(reminder, globalIo);
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
    // logger.info(`Processing missed dose check for reminder: ${reminderId}`);

    // Reload reminder to get current status
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "medicine",
        select: "name id category dosage instructions"
      })
      .populate("user");

    if (!reminder) {
      logger.warn(
        `Reminder ${reminderId} not found, skipping missed dose check`
      );
      return { success: false, reason: "reminder_not_found" };
    }

    // Check if any medicines are still pending
    const hasPendingMedicines = reminder.status === "pending";

    if (hasPendingMedicines) {
      logger.info(
        `Reminder ${reminderId} has pending medicines, marking as missed`
      );

      // Mark reminder as missed
      await Reminder.findByIdAndUpdate(reminderId, {
        status: "missed",
        missedAt: new Date()
      });

      // Notify parent if exists and not already notified
      if (reminder.user?.parent && !reminder.parentNotified) {
        await notifyParent(reminder, globalIo);
      }

      logger.info(
        `Reminder ${reminderId} automatically marked as missed after 30 minutes of inactivity`
      );
    } else {
      // logger.info(
      //   `Reminder ${reminderId} has no pending medicines, no action needed`
      // );
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
        path: "medicine",
        select: "name id category dosage instructions"
      })
      .populate("user");

    if (!reminder) {
      logger.warn(
        `Reminder ${reminderId} not found, cannot create next occurrence`
      );
      return { success: false, reason: "reminder_not_found" };
    }

    // Create next occurrence based on reminder pattern
    const result = await createNextOccurrence(reminder, globalIo);
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

    // Send SMS notification if enabled
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
  try {
    // Extract medicine names
    const medicineNames = reminder.medicine?.name;

    // Format time
    const time = new Date(reminder.time);
    const timeFormatted = time.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    return {
      title: `Medicine Reminder`,
      body: `It's time to take ${medicineNames} at ${timeFormatted}`,
      data: {
        reminderId: reminder._id.toString(),
        medicines: {
          id: reminder.medicine?._id.toString(),
          name: reminder.medicine?.name || "unknown medication",
          dosage: reminder.medicine?.dosage
        },
        time: time.toISOString(),
        timeFormatted: timeFormatted,
        user: reminder.user?._id.toString()
      }
    };
  } catch (error) {
    logger.error(`Error formatting notification: ${error.message}`);
    return {
      title: "Medicine Reminder",
      body: "It's time to take your medication",
      data: { reminderId: reminder._id.toString() }
    };
  }
}

// Schedule a check for missed doses
async function scheduleMissedDoseCheck(reminder, io) {
  try {
    // Set check time to exactly 30 minutes after reminder time
    const reminderTime = new Date(reminder.time);
    const checkTime = new Date(reminderTime.getTime() + 30 * 60 * 1000); // 30 minutes in milliseconds

    // Only schedule if check time is in the future
    const now = new Date();
    const nowPlusBuffer = new Date(now.getTime() + 60 * 1000); // Add 1 minute buffer

    if (checkTime <= nowPlusBuffer) {
      // If check time is too close or in the past, schedule for 30 minutes from now
      const adjustedCheckTime = new Date(now.getTime() + 30 * 60 * 1000);
      logger.info(
        `Missed dose check time for reminder ${
          reminder._id
        } adjusted to ${adjustedCheckTime.toISOString()}`
      );

      // Calculate delay in milliseconds (30 minutes)
      const delay = 30 * 60 * 1000;

      // Add to missed dose queue with delay
      await missedDoseQueue.add(
        {
          reminderId: reminder._id.toString()
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
        `Scheduled missed dose check for reminder ${reminder._id} in 30 minutes from now`
      );
      return true;
    }

    // Calculate delay in milliseconds
    const delay = checkTime.getTime() - now.getTime();

    // Add to missed dose queue with delay
    await missedDoseQueue.add(
      {
        reminderId: reminder._id.toString()
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
      } at ${checkTime.toISOString()} (in ${Math.round(
        delay / 1000 / 60
      )} minutes)`
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
    const isAutomatic = reminder.missedAt ? "automatically " : "";

    // Prepare notification data
    const medicineNames = reminder.medicine?.name;

    const notification = {
      title: "Missed Dose Alert",
      body: `${reminder?.user?.name} has ${isAutomatic}missed their dose of ${medicineNames}`,
      data: {
        reminderId: reminder._id,
        dependentId: reminder.user._id,
        time: reminder.time.toISOString().split("T")[1].split(".")[0],
        automatic: !!reminder.missedAt
      }
    };

    // Send push notification to parent
    if (parent.notificationPreferences?.push) {
      sendPushNotification(io, parent._id.toString(), notification);
      logger.info(`Push notification sent to parent ${parent._id}`);
    }

    // Send SMS to parent if enabled
    if (parent.notificationPreferences?.sms && parent.phone) {
      await sendMissedDoseSMS(parent, reminder);
      logger.info(`SMS notification sent to parent ${parent.phone}`);
    }

    // Update reminder to indicate parent was notified
    await Reminder.findByIdAndUpdate(reminder._id, {
      parentNotified: true
    });

    logger.info(
      `Parent ${parent._id} notified about ${
        isAutomatic ? "automatically " : ""
      }missed dose for reminder ${reminder._id}`
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
    // Calculate next time based on frequency and repeat pattern
    const nextTime = calculateNextTime(reminder);

    // Stop if next time is after schedule end date
    if (reminder.scheduleEnd && nextTime > new Date(reminder.scheduleEnd)) {
      await Reminder.findByIdAndUpdate(reminder._id, {
        status: "missed",
        missedAt: new Date()
      });
      logger.info(
        `Reminder ${reminder._id} has reached its end date, no more occurrences`
      );
      return null;
    }

    // Create new reminder for next occurrence
    const newReminder = new Reminder({
      medicine: reminder.medicine.id,
      user: reminder.user._id,
      scheduleStart: reminder.scheduleStart,
      scheduleEnd: reminder.scheduleEnd,
      frequency: reminder.frequency,
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

// Create next reminder occurrence
async function createNextOccurrence(reminder, io) {
  try {
    // Calculate next time based on frequency and repeat pattern
    const nextTime = calculateNextTime(reminder);

    // Stop if next time is after schedule end date
    if (reminder.scheduleEnd && nextTime > new Date(reminder.scheduleEnd)) {
      await Reminder.findByIdAndUpdate(reminder._id, {
        status: "missed",
        missedAt: new Date()
      });
      logger.info(
        `Reminder ${reminder._id} has reached its end date, no more occurrences`
      );
      return null;
    }

    const newReminder = new Reminder({
      medicine: reminder.medicine.id,
      user: reminder.user._id,
      scheduleStart: reminder.scheduleStart,
      scheduleEnd: reminder.scheduleEnd,
      frequency: reminder.frequency,
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

/**
 * Calculate next time for recurring reminder
 * @param {Object} reminder - Reminder document
 * @returns {Date} - Next reminder time
 */
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

    // Add to reminder queue with delay - don't pass io object
    await reminderQueue.add(
      {
        reminderId: reminderId.toString()
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
    return true;
  } catch (error) {
    logger.error(`Error scheduling reminder: ${error.message}`);
    return false;
  }
}

// Schedule reminders within a date range
async function scheduleRemindersInRange(startDate, endDate, io, userId = null) {
  try {
    // Convert to Date objects if they're not already
    startDate = new Date(startDate);
    endDate = new Date(endDate);

    logger.info(
      `Scheduling reminders between ${startDate.toISOString()} and ${endDate.toISOString()}`
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
      logger.info(`Filtering reminders for user: ${userId}`);
    }

    // Process reminders in batches to avoid memory issues
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;
    let totalScheduled = 0;
    let totalFound = 0;

    // Process in batches
    while (hasMore) {
      // Find batch of reminders
      const reminders = await Reminder.find(query)
        .sort({ time: 1 })
        .skip(skip)
        .limit(batchSize)
        .lean();

      totalFound += reminders.length;

      if (reminders.length < batchSize) {
        hasMore = false;
      }

      logger.info(
        `Found ${reminders.length} reminders in batch, processing...`
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
          logger.debug(
            `Scheduled reminder ${
              reminder._id
            } for ${reminderTime.toISOString()}`
          );
        } else {
          logger.warn(
            `Reminder ${
              reminder._id
            } time ${reminderTime.toISOString()} is in the past, skipping`
          );
        }
      }

      skip += batchSize;
    }

    logger.info(
      `Found ${totalFound} reminders, scheduled ${totalScheduled} reminders between ${startDate.toISOString()} and ${endDate.toISOString()}`
    );
    return totalScheduled;
  } catch (error) {
    logger.error(`Error scheduling reminders in range: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    return 0;
  }
}

// Initialize reminders for upcoming period
async function initializeReminders(io) {
  try {
    logger.info("Starting to initialize reminders...");

    // Schedule reminders for the next 2 days
    const scheduledCount = await scheduleRemindersInRange(
      getCurrentDateTime(),
      addHoursToDate(48),
      io
    );

    logger.info(`Initialized ${scheduledCount} reminders for the next 2 days`);
    return scheduledCount;
  } catch (error) {
    logger.error(`Error initializing reminders: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
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

    // Schedule this user's reminders
    const count = await scheduleRemindersInRange(
      getCurrentDateTime(),
      addHoursToDate(0.3),
      io,
      userId
    );

    logger.info(`Scheduled ${count} reminders for user ${userId}`);
    return count;
  } catch (error) {
    logger.error(
      `Error scheduling reminders for user ${userId}: ${error.message}`
    );
    return 0;
  }
}

/**
 * Cancel a specific reminder job
 * @param {string} reminderId - Reminder ID to cancel
 */
const cancelReminder = async (reminderId) => {
  try {
    // Find the existing jobs for this reminder
    const reminderJobKey = `bull:medication-reminders:${reminderId}`;
    const missedDoseJobKey = `bull:missed-dose-checks:${reminderId}`;

    // Clean up reminder job if exists
    const reminderJobs = await reminderQueue.getJobs([
      "delayed",
      "active",
      "waiting"
    ]);
    for (const job of reminderJobs) {
      if (job.data.reminderId === reminderId.toString()) {
        await job.remove();
        logger.info(`Cancelled reminder job for ${reminderId}`);
      }
    }

    // Clean up missed dose job if exists
    const missedDoseJobs = await missedDoseQueue.getJobs([
      "delayed",
      "active",
      "waiting"
    ]);
    for (const job of missedDoseJobs) {
      if (job.data.reminderId === reminderId.toString()) {
        await job.remove();
        logger.info(`Cancelled missed dose job for ${reminderId}`);
      }
    }

    logger.info(`Cancelled reminder ${reminderId}`);
    return true;
  } catch (error) {
    logger.error(`Error cancelling reminder ${reminderId}: ${error.message}`);
    return false;
  }
};

/**
 * Reschedule a snoozed reminder
 * @param {string} reminderId - Reminder ID
 * @param {Date|string} snoozedUntil - Time to snooze until
 * @param {Object} io - Socket.io instance
 */
const snoozeReminder = async (reminderId, snoozedUntil, io) => {
  try {
    // Parse snoozed time
    const snoozedTime = new Date(snoozedUntil);

    // Update reminder with snoozed status and time
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminderId,
      {
        status: "snoozed",
        snoozedUntil: snoozedTime
      },
      { new: true }
    )
      .populate({
        path: "medicine",
        select: "name id category dosage instructions"
      })
      .populate("user");

    if (!updatedReminder) {
      logger.error(`Reminder ${reminderId} not found for snooze`);
      return null;
    }

    // Cancel existing jobs
    await cancelReminder(reminderId);

    // Schedule new reminder with the snoozed time
    await scheduleReminder(reminderId, snoozedTime, io);

    logger.info(
      `Snoozed reminder ${reminderId} until ${snoozedTime.toISOString()}`
    );
    return updatedReminder;
  } catch (error) {
    logger.error(`Error snoozing reminder ${reminderId}: ${error.message}`);
    return null;
  }
};

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
  getQueuesStatus,
  setSocketIo,
  initializeQueues,
  cancelReminder,
  snoozeReminder,
  calculateNextTime,
  scheduleNextRecurrence
};

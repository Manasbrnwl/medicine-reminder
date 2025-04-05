const schedule = require("node-schedule");
const Reminder = require("../src/models/Reminder");
const User = require("../src/models/User");
const {
  sendEmailNotification,
  sendPushNotification,
  sendSMSNotification,
  formatReminderNotification,
  formatMissedDoseNotification
} = require("./notifications");

// Store scheduled jobs
const scheduledJobs = {};

/**
 * Schedule a reminder notification
 * @param {object} reminder - Reminder document
 * @param {object} io - Socket.io instance
 */
exports.scheduleReminder = async (reminder, io) => {
  try {
    // Populate medicine and user information
    const populatedReminder = await Reminder.findById(reminder._id)
      .populate("medicine")
      .populate("user");

    if (!populatedReminder) return;

    const jobId = reminder._id.toString();
    const reminderTime = new Date(reminder.time);

    // Cancel any existing job with the same ID
    if (scheduledJobs[jobId]) {
      scheduledJobs[jobId].cancel();
    }

    // Schedule the job
    const job = schedule.scheduleJob(reminderTime, async () => {
      const notification = formatReminderNotification(populatedReminder);
      const user = populatedReminder.user;

      // Check user notification preferences and send accordingly
      if (user.notificationPreferences.push) {
        sendPushNotification(io, user._id.toString(), notification);
      }

      if (user.notificationPreferences.email) {
        await sendEmailNotification(
          user.email,
          notification.title,
          notification.body,
          `<h1>${notification.title}</h1><p>${notification.body}</p><p>Please mark this reminder as "Taken" in the app.</p>`
        );
      }

      if (user.notificationPreferences.sms && user.phone) {
        await sendSMSNotification(
          user.phone,
          `${notification.title}: ${notification.body}`
        );
      }

      // Update the reminder status to sent notification
      await Reminder.findByIdAndUpdate(reminder._id, {
        notificationSent: true,
        notificationCount: populatedReminder.notificationCount + 1
      });

      // Schedule a check for missed dose after 30 minutes
      scheduleMissedDoseCheck(reminder._id, io);

      // Handle recurring reminders
      if (populatedReminder.repeat !== "none") {
        await scheduleNextRecurringReminder(populatedReminder, io);
      }
    });

    // Store the job reference
    scheduledJobs[jobId] = job;

    console.log(`Scheduled reminder for ${reminderTime.toLocaleString()}`);
  } catch (error) {
    console.error("Error scheduling reminder:", error);
  }
};

/**
 * Schedule the next occurrence of a recurring reminder
 * @param {object} reminder - The current reminder document
 * @param {object} io - Socket.io instance
 */
const scheduleNextRecurringReminder = async (reminder, io) => {
  try {
    // Calculate the next occurrence time based on repeat settings
    const nextTime = calculateNextReminderTime(reminder);

    // Check if medicine has an end date and if next reminder is past that date
    const medicine = reminder.medicine;
    if (medicine.endDate && nextTime > new Date(medicine.endDate)) {
      console.log(
        `Medicine ${medicine.name} has reached its end date. No more reminders will be scheduled.`
      );
      return;
    }

    // Create a new reminder for the next occurrence
    const newReminder = new Reminder({
      medicine: reminder.medicine._id,
      user: reminder.user._id,
      time: nextTime,
      repeat: reminder.repeat,
      repeatInterval: reminder.repeatInterval,
      repeatUnit: reminder.repeatUnit
    });

    // Save the new reminder
    await newReminder.save();

    // Schedule the new reminder
    await exports.scheduleReminder(newReminder, io);

    console.log(
      `Created next recurring reminder for ${nextTime.toLocaleString()}`
    );
  } catch (error) {
    console.error("Error scheduling recurring reminder:", error);
  }
};

/**
 * Calculate the next time for a recurring reminder
 * @param {object} reminder - The reminder document
 * @returns {Date} - The next reminder time
 */
const calculateNextReminderTime = (reminder) => {
  const currentTime = new Date(reminder.time);
  let nextTime = new Date(currentTime);

  switch (reminder.repeat) {
    case "daily":
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    case "weekly":
      nextTime.setDate(nextTime.getDate() + 7);
      break;
    case "monthly":
      nextTime.setMonth(nextTime.getMonth() + 1);
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
  }

  return nextTime;
};

/**
 * Schedule a check for missed doses
 * @param {string} reminderId - Reminder ID
 * @param {object} io - Socket.io instance
 */
const scheduleMissedDoseCheck = (reminderId, io) => {
  try {
    const checkTime = new Date();
    checkTime.setMinutes(checkTime.getMinutes() + 30); // Check 30 minutes later

    const jobId = `check_${reminderId}`;

    // Cancel any existing job with the same ID
    if (scheduledJobs[jobId]) {
      scheduledJobs[jobId].cancel();
    }

    // Schedule the check
    const job = schedule.scheduleJob(checkTime, async () => {
      // Find the reminder and check its status
      const reminder = await Reminder.findById(reminderId)
        .populate("medicine")
        .populate("user");

      if (!reminder) return;

      // If still pending, mark as missed and notify parent if exists
      if (reminder.status === "pending") {
        // Update status to missed
        await Reminder.findByIdAndUpdate(reminderId, {
          status: "missed"
        });

        // Check if the user has a parent and notify them
        if (reminder.user.parent && !reminder.parentNotified) {
          const parent = await User.findById(reminder.user.parent);

          if (parent) {
            const missedNotification = formatMissedDoseNotification(reminder);

            // Send notifications to parent
            if (parent.notificationPreferences.push) {
              sendPushNotification(
                io,
                parent._id.toString(),
                missedNotification
              );
            }

            if (parent.notificationPreferences.email) {
              await sendEmailNotification(
                parent.email,
                missedNotification.title,
                missedNotification.body,
                `<h1>${missedNotification.title}</h1><p>${missedNotification.body}</p><p>You can mark this dose as taken on their behalf in the app.</p>`
              );
            }

            if (parent.notificationPreferences.sms && parent.phone) {
              await sendSMSNotification(
                parent.phone,
                `${missedNotification.title}: ${missedNotification.body}`
              );
            }

            // Update the reminder to indicate parent was notified
            await Reminder.findByIdAndUpdate(reminderId, {
              parentNotified: true
            });
          }
        }
      }
    });

    // Store the job reference
    scheduledJobs[jobId] = job;
  } catch (error) {
    console.error("Error scheduling missed dose check:", error);
  }
};

/**
 * Cancel a scheduled reminder
 * @param {string} reminderId - Reminder ID
 */
exports.cancelReminder = (reminderId) => {
  const jobId = reminderId.toString();
  const checkJobId = `check_${jobId}`;

  // Cancel the main reminder job
  if (scheduledJobs[jobId]) {
    scheduledJobs[jobId].cancel();
    delete scheduledJobs[jobId];
  }

  // Cancel the missed dose check job
  if (scheduledJobs[checkJobId]) {
    scheduledJobs[checkJobId].cancel();
    delete scheduledJobs[checkJobId];
  }

  console.log(`Cancelled reminder ${reminderId}`);
};

/**
 * Schedule a reminder for a snoozed dose
 * @param {object} reminder - Reminder document
 * @param {Date} snoozedUntil - New time for the reminder
 * @param {object} io - Socket.io instance
 */
exports.snoozeReminder = async (reminder, snoozedUntil, io) => {
  try {
    // Update the reminder with snoozed status and time
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminder._id,
      {
        status: "snoozed",
        snoozedUntil
      },
      { new: true }
    );

    // Schedule the new reminder
    this.scheduleReminder(updatedReminder, io);

    console.log(
      `Snoozed reminder ${reminder._id} until ${snoozedUntil.toLocaleString()}`
    );
  } catch (error) {
    console.error("Error snoozing reminder:", error);
  }
};

/**
 * Initialize all active reminders from the database
 * @param {object} io - Socket.io instance
 */
exports.initializeReminders = async (io) => {
  try {
    const now = new Date();

    // Find all active reminders that are in the future
    const reminders = await Reminder.find({
      time: { $gt: now },
      status: { $in: ["pending", "snoozed"] }
    });

    console.log(`Initializing ${reminders.length} upcoming reminders`);

    // Schedule each reminder
    for (const reminder of reminders) {
      await this.scheduleReminder(reminder, io);
    }
  } catch (error) {
    console.error("Error initializing reminders:", error);
  }
};

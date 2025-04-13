const twilio = require("twilio");
const logger = require("./logger");

// Initialize Twilio client - DISABLED
const initTwilioClient = () => {
  logger.info("Twilio client initialization disabled");
  return null;
};

/**
 * Send SMS notification using Twilio - DISABLED
 * @param {string} to - Recipient's phone number (E.164 format)
 * @param {string} message - SMS message content
 * @returns {Promise<boolean>} - Success status
 */
const sendSMSNotification = async (to, message) => {
  logger.info(
    `SMS functionality is disabled. Would have sent to ${to}: "${message}"`
  );
  return false;
};

/**
 * Format and send a medicine reminder SMS - DISABLED
 * @param {Object} user - User object with phone number
 * @param {Object} reminder - Reminder object with medicine details
 * @returns {Promise<Object>} - Twilio message object or error
 */
const sendReminderSMS = async (user, reminder) => {
  try {
    if (!user.phone) {
      throw new Error("User does not have a phone number");
    }

    const medicineNames = reminder.medicines
      .map((med) => med.medicine?.medicineStack?.name)
      .join(", ");

    const timeFormatted = new Date(reminder.time).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const message = `REMINDER: Time to take ${medicineNames} at ${timeFormatted}. Open the Medicine Reminder app to mark as taken.`;

    logger.info(
      `SMS functionality is disabled. Would have sent reminder to ${user.phone}: "${message}"`
    );
    return false;
  } catch (error) {
    logger.error(`Failed to prepare reminder SMS: ${error.message}`);
    throw error;
  }
};

/**
 * Format and send a missed dose SMS - DISABLED
 * @param {Object} user - User object with phone number
 * @param {Object} reminder - Reminder object with medicine details
 * @returns {Promise<Object>} - Twilio message object or error
 */
const sendMissedDoseSMS = async (user, reminder) => {
  try {
    if (!user.phone) {
      throw new Error("User does not have a phone number");
    }

    const medicineNames = reminder.medicines
      .map((med) => med.medicine?.medicineStack?.name)
      .join(", ");

    const timeFormatted = new Date(reminder.time).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const isAutomatic = reminder.missedAt ? " automatically" : "";

    const message = reminder.user._id.equals(user._id)
      ? `MISSED DOSE: Your medication ${medicineNames} scheduled for ${timeFormatted} was${isAutomatic} marked as missed. Please open the Medicine Reminder app for details.`
      : `MISSED DOSE ALERT: ${reminder.user.name} has${isAutomatic} missed their dose of ${medicineNames} scheduled for ${timeFormatted}.`;

    logger.info(
      `SMS functionality is disabled. Would have sent missed dose alert to ${user.phone}: "${message}"`
    );
    return false;
  } catch (error) {
    logger.error(`Failed to prepare missed dose SMS: ${error.message}`);
    throw error;
  }
};

module.exports = {
  sendSMSNotification,
  sendReminderSMS,
  sendMissedDoseSMS
};

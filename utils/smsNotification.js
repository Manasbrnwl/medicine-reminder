const twilio = require("twilio");
const logger = require("./logger");

// Initialize Twilio client with env variables
const initTwilioClient = () => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      logger.warn(
        "Twilio credentials missing. SMS notifications will be disabled."
      );
      return null;
    }

    const client = twilio(accountSid, authToken);
    logger.info("Twilio client initialized successfully");
    return client;
  } catch (error) {
    logger.error(`Twilio client initialization failed: ${error.message}`);
    return null;
  }
};

// Get or initialize Twilio client
const getTwilioClient = (() => {
  let client = null;
  return () => {
    if (!client) {
      client = initTwilioClient();
    }
    return client;
  };
})();

/**
 * Send SMS notification using Twilio
 * @param {string} to - Recipient's phone number (E.164 format)
 * @param {string} message - SMS message content
 * @returns {Promise<boolean>} - Success status
 */
const sendSMSNotification = async (to, message) => {
  try {
    // Validate phone number format
    if (!to.startsWith("+")) {
      logger.error(
        `Invalid phone number format: ${to}. Must be in E.164 format (+1XXXXXXXXXX)`
      );
      return false;
    }

    const client = getTwilioClient();
    if (!client) {
      logger.warn(`Twilio client not available. SMS to ${to} not sent.`);
      return false;
    }

    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioPhone) {
      logger.error("Twilio phone number missing in environment variables");
      return false;
    }

    // Send SMS via Twilio
    const result = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to
    });

    logger.info(`SMS sent successfully to ${to}, SID: ${result.sid}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send SMS to ${to}: ${error.message}`);
    return false;
  }
};

/**
 * Format and send a medicine reminder SMS
 * @param {Object} user - User object with phone number
 * @param {Object} reminder - Reminder object with medicine details
 * @returns {Promise<boolean>} - Success status
 */
const sendReminderSMS = async (user, reminder) => {
  try {
    if (!user.phone) {
      logger.warn("User does not have a phone number");
      return false;
    }

    const medicineNames = reminder.medicine?.name;

    const timeFormatted = new Date(reminder.time).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const message = `REMINDER: Time to take ${medicineNames} at ${timeFormatted}. Open the Medicine Reminder app to mark as taken.`;

    return await sendSMSNotification(user.phone, message);
  } catch (error) {
    logger.error(`Failed to send reminder SMS: ${error.message}`);
    return false;
  }
};

/**
 * Format and send a missed dose SMS
 * @param {Object} user - User object with phone number
 * @param {Object} reminder - Reminder object with medicine details
 * @returns {Promise<boolean>} - Success status
 */
const sendMissedDoseSMS = async (user, reminder) => {
  try {
    if (!user.phone) {
      logger.warn("User does not have a phone number");
      return false;
    }

    const medicineNames = reminder.medicine?.name;

    const timeFormatted = new Date(reminder.time).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const isAutomatic = reminder.missedAt ? " automatically" : "";

    const message = reminder.user._id.equals(user._id)
      ? `MISSED DOSE: Your medication ${medicineNames} scheduled for ${timeFormatted} was${isAutomatic} marked as missed. Please open the Medicine Reminder app for details.`
      : `MISSED DOSE ALERT: ${reminder.user.name} has${isAutomatic} missed their dose of ${medicineNames} scheduled for ${timeFormatted}.`;

    return await sendSMSNotification(user.phone, message);
  } catch (error) {
    logger.error(`Failed to send missed dose SMS: ${error.message}`);
    return false;
  }
};

module.exports = {
  sendSMSNotification,
  sendReminderSMS,
  sendMissedDoseSMS
};

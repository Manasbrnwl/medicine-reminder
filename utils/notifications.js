const nodemailer = require("nodemailer");
// const { Twilio } = require("twilio");
require("dotenv").config();
const logger = require("./logger");
const { sendFCMNotification } = require("./firebase");

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Twilio client initialization commented out
// const twilioClient = new Twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );

/**
 * Send email notification
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Email text content
 * @param {string} html - Email html content
 * @returns {Promise} - Promise resolved on email sent
 */
exports.sendEmailNotification = async (email, subject, text, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text,
      html
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        logger.error(`Email error: ${error.message}`);
        return false;
      }
      logger.info(`Email notification sent to ${email}`);
      return true;
    });
  } catch (error) {
    logger.error(`Email error: ${error.message}`);
    return false;
  }
};

/**
 * Send push notification via FCM
 * @param {string} fcmToken - User's FCM token
 * @param {object} data - Notification data
 * @returns {Promise<boolean>} - Success status
 */
exports.sendPushNotification = async (fcmToken, data) => {
  try {
    const success = await sendFCMNotification(fcmToken, data);
    if (success) {
      logger.info(`Push notification sent successfully`);
    }
    return success;
  } catch (error) {
    logger.error(`Push notification error: ${error.message}`);
    return false;
  }
};

/**
 * Send SMS notification (DISABLED)
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - SMS content
 * @returns {Promise} - Promise resolved on SMS sent
 */
exports.sendSMSNotification = async (phoneNumber, message) => {
  logger.info(
    `SMS functionality is disabled. Would have sent to ${phoneNumber}: "${message}"`
  );
  return false;
};

/**
 * Format a reminder notification
 * @param {object} reminder - Reminder object with populated medicine
 * @returns {object} - Formatted notification content
 */
exports.formatReminderNotification = (reminder) => {
  const medicineName = reminder.medicine?.name || "your medicine";
  const dosage = reminder.medicine?.dosage || "prescribed dose";

  return {
    title: `Medicine Reminder: ${medicineName}`,
    body: `It's time to take ${dosage} of ${medicineName}`,
    data: {
      reminderId: reminder._id,
      medicineId: reminder.medicine?._id,
      time: reminder.time
    }
  };
};

/**
 * Format a missed dose notification for parents
 * @param {object} reminder - Reminder object with populated medicine and user
 * @returns {object} - Formatted notification content
 */
exports.formatMissedDoseNotification = (reminder) => {
  const dependentName = reminder.user?.name || "Your dependent";
  const medicineName = reminder.medicine?.name || "their medicine";

  return {
    title: `Missed Dose Alert`,
    body: `${dependentName} missed their dose of ${medicineName}`,
    data: {
      reminderId: reminder._id,
      medicineId: reminder.medicine?._id,
      dependentId: reminder.user?._id,
      time: reminder.time
    }
  };
};

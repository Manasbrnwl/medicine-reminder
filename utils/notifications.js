const nodemailer = require("nodemailer");
const { Twilio } = require("twilio");
require("dotenv").config();

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

// Configure Twilio client
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

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
        console.error("Email error:", error);
        return false;
      }
      console.log(`Email notification sent to ${email}`);
      return true;
    });
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};

/**
 * Send push notification via Socket.io
 * @param {object} io - Socket.io instance
 * @param {string} userId - User ID for the room
 * @param {object} data - Notification data
 * @returns {boolean} - Success status
 */
exports.sendPushNotification = (io, userId, data) => {
  try {
    io.to(userId).emit("notification", data);
    console.log(`Push notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error("Push notification error:", error);
    return false;
  }
};

/**
 * Send SMS notification (implementation depends on the SMS service provider)
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - SMS content
 * @returns {Promise} - Promise resolved on SMS sent
 */
exports.sendSMSNotification = async (phoneNumber, message) => {
  try {
    // Format phone number to E.164 format if it doesn't start with +
    const formattedPhoneNumber = phoneNumber.startsWith("+91")
      ? phoneNumber
      : `+91${phoneNumber}`;

    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhoneNumber
    });

    console.log(`SMS sent to ${phoneNumber}. SID: ${result.sid}`);
    return true;
  } catch (error) {
    console.error("SMS error:", error);
    return false;
  }
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

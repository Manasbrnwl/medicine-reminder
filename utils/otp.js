const User = require("../src/models/User");
const {
  sendEmailNotification,
  sendSMSNotification
} = require("./notifications");

/**
 * Generate a random 6 digit OTP
 * @returns {string} OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Calculate OTP expiry (10 minutes from now)
 * @returns {Date} OTP expiry date
 */
const calculateOTPExpiry = () => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 10); // OTP valid for 10 minutes
  return expiryTime;
};

/**
 * Generate and save OTP for a user
 * @param {string} identifier - Email or phone number
 * @param {boolean} isEmail - Whether the identifier is an email
 * @returns {Promise<object>} Result with status and user
 */
exports.generateAndSaveOTP = async (identifier, isEmail = true) => {
  try {
    let user;

    if (isEmail) {
      user = await User.findOne({ email: identifier });
    } else {
      user = await User.findOne({ phone: identifier });
    }

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = calculateOTPExpiry();

    // Save unhashed OTP for sending to user
    const plainOTP = otp;

    // Save OTP to user (will be hashed via pre-save hook)
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP via email or SMS
    let sent = false;
    if (isEmail) {
      sent = sendEmailNotification(
        user.email,
        "Medicine Reminder App - Login OTP",
        `Your OTP for login is: ${plainOTP}. It will expire in 10 minutes.`,
        `<h1>Login OTP</h1><p>Your OTP for login is: <strong>${plainOTP}</strong></p><p>It will expire in 10 minutes.</p>`
      )
        .then((res) => res)
        .catch(() => false);
    } else if (user.phone) {
      sent = await sendSMSNotification(
        user.phone,
        `Your Medicine Reminder App login OTP is: ${plainOTP}. It will expire in 10 minutes.`
      )
        .then((res) => res)
        .catch(() => false);
    }

    if (!sent) {
      return {
        success: false,
        message: `Failed to send OTP to ${isEmail ? "email" : "phone"}`
      };
    }

    return {
      success: true,
      message: `OTP sent to ${isEmail ? user.email : user.phone}`,
      userId: user._id
    };
  } catch (error) {
    console.error("OTP generation error:", error);
    return { success: false, message: "Error generating OTP" };
  }
};

/**
 * Verify OTP for a user
 * @param {string} userId - User ID
 * @param {string} otp - OTP to verify
 * @returns {Promise<object>} Result with status and user
 */
exports.verifyOTP = async (userId, otp) => {
  try {
    const user = await User.findById(userId).select("+otp +otpExpiry");

    if (!user) {
      return { success: false, message: "User not found" };
    }

    if (!user.otp || !user.otpExpiry) {
      return { success: false, message: "No OTP was generated for this user" };
    }

    if (user.isOTPExpired()) {
      return { success: false, message: "OTP has expired" };
    }

    const isOTPValid = await user.matchOTP(otp);

    if (!isOTPValid) {
      return { success: false, message: "Invalid OTP" };
    }

    // Clear OTP after successful verification
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return { success: true, user };
  } catch (error) {
    console.error("OTP verification error:", error);
    return { success: false, message: "Error verifying OTP" };
  }
};

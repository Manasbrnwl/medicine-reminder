const User = require("../models/User");
const { sendEmailNotification } = require("../../utils/notifications");

// @desc    Get subscription status
// @route   GET /api/subscription/status
// @access  Private
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      data: {
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Upgrade to premium subscription
// @route   POST /api/subscription/upgrade
// @access  Private
exports.upgradeSubscription = async (req, res) => {
  try {
    const { paymentMethod } = req.body;

    if (!["card", "upi", "netbanking"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method"
      });
    }

    const user = await User.findById(req.user.id);

    // Update subscription details
    user.subscription.status = "premium";
    user.subscription.startDate = new Date();
    user.subscription.endDate = new Date(
      new Date().setFullYear(new Date().getFullYear() + 1)
    );
    user.subscription.autoRenew = true;
    user.subscription.paymentMethod = paymentMethod;

    await user.save();

    // Send confirmation email
    await sendEmailNotification(
      user.email,
      "Subscription Upgrade Confirmation",
      "Your subscription has been successfully upgraded to premium.",
      `
        <h1>Subscription Upgrade Confirmation</h1>
        <p>Dear ${user.name},</p>
        <p>Your subscription has been successfully upgraded to premium.</p>
        <p>Your premium subscription will be valid until ${user.subscription.endDate.toLocaleDateString()}.</p>
        <p>Thank you for choosing our service!</p>
      `
    );

    res.json({
      success: true,
      message: "Subscription upgraded successfully",
      data: {
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Cancel subscription
// @route   POST /api/subscription/cancel
// @access  Private
exports.cancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.subscription.status !== "premium") {
      return res.status(400).json({
        success: false,
        message: "No active premium subscription to cancel"
      });
    }

    // Update subscription details
    user.subscription.autoRenew = false;
    user.subscription.status = "free";
    user.subscription.endDate = new Date(
      new Date().setDate(new Date().getDate() + 30)
    );

    await user.save();

    // Send confirmation email
    await sendEmailNotification(
      user.email,
      "Subscription Cancellation Confirmation",
      "Your premium subscription has been cancelled.",
      `
        <h1>Subscription Cancellation Confirmation</h1>
        <p>Dear ${user.name},</p>
        <p>Your premium subscription has been cancelled.</p>
        <p>You will continue to have access to premium features until ${user.subscription.endDate.toLocaleDateString()}.</p>
        <p>After that, you will be switched to the free tier.</p>
        <p>We hope to see you back soon!</p>
      `
    );

    res.json({
      success: true,
      message: "Subscription cancelled successfully",
      data: {
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const User = require("../models/User");
const {
  sendEmailNotification,
  sendPushNotification
} = require("../../utils/notifications");
const { addISTOffset } = require("../default/common");

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
    const { days } = req.body;

    const user = await User.findById(req.user.id);
    if (user.subscription.endDate > addISTOffset(new Date())) {
      user.subscription.endDate = addISTOffset(
        new Date(
          new Date(user.subscription.endDate).setDate(
            new Date(user.subscription.endDate).getDate() + days
          )
        )
      );
    } else {
      user.subscription.status = "premium";
      user.subscription.startDate = addISTOffset(new Date());
      user.subscription.endDate = addISTOffset(
        new Date(new Date().setDate(new Date().getDate() + days))
      );
    }
    user.streakCount = 0;
    user.streakChange = addISTOffset(new Date());
    await user.save();
    // Send confirmation email
    // await sendEmailNotification(
    //   user.email,
    //   "Subscription Upgrade Confirmation",
    //   "Your subscription has been successfully upgraded to premium.",
    //   `
    //     <h1>Subscription Upgrade Confirmation</h1>
    //     <p>Dear ${user.name},</p>
    //     <p>Your subscription has been successfully upgraded to premium.</p>
    //     <p>Your premium subscription will be valid until ${user.subscription.endDate.toLocaleDateString()}.</p>
    //     <p>Thank you for choosing our service!</p>
    //   `
    // );
    // Send push notification
    let notification = {
      title: "Subscription Upgrade Confirmation",
      body: `Your subscription has been successfully upgraded to premium. Your premium subscription will be valid until ${user.subscription.endDate.toLocaleDateString()}. Thank you for choosing our service!`
    };
    sendPushNotification(user.fcmToken, notification);

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
    user.subscription.endDate = addISTOffset(
      new Date(new Date().setDate(new Date().getDate() + 30))
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

exports.getSubscriptionTypes = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const subscriptionTypes = [
      {
        id: "1",
        name: "Free",
        price: 0,
        duration: "15 days",
        features: [
          "Access to all features",
          "Unlimited reminders",
          "Analytics",
          "View Dependents Analytics"
        ]
      },
      {
        id: "2",
        name: "Premium",
        price: 100,
        discounted_price: 100,
        duration: "1 month",
        features: [
          "Access to all features",
          "Unlimited reminders",
          "Analytics",
          "View Dependents Analytics"
        ]
      },
      {
        id: "3",
        name: "Premium",
        price: 250,
        discounted_price: 250,
        duration: "3 months",
        features: [
          "Access to all features",
          "Unlimited reminders",
          "Analytics",
          "View Dependents Analytics"
        ]
      },
      {
        id: "4",
        name: "Premium",
        price: 800,
        discounted_price: 800,
        duration: "1 year",
        features: [
          "Access to all features",
          "Unlimited reminders",
          "Analytics",
          "View Dependents Analytics"
        ]
      }
    ];
    user.streakCount > 0
      ? subscriptionTypes.map((subscriptionType) => {
          if (subscriptionType.id === "2") {
            subscriptionType.discounted_price = Math.max(
              0,
              subscriptionType.price - user.streakCount * 2
            ); // Apply streak discount
          }
          if (subscriptionType.id === "3") {
            subscriptionType.discounted_price = Math.max(
              0,
              subscriptionType.price - user.streakCount * 3
            ); // Apply streak discount
          }
          if (subscriptionType.id === "4") {
            subscriptionType.discounted_price = Math.max(
              0,
              subscriptionType.price - user.streakCount * 4
            ); // Apply streak discount
          }
          return subscriptionType;
        })
      : subscriptionTypes;
    res.json({
      success: true,
      data: {
        subscriptionTypes
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

const express = require("express");
const {
  getSubscriptionStatus,
  upgradeSubscription,
  cancelSubscription
} = require("../controllers/subscriptionController");
const { protect, checkSubscription } = require("../middleware/auth");

const router = express.Router();

// All routes are protected and require an active subscription
router.use(protect);
router.use(checkSubscription);

// Subscription routes
router.get("/status", getSubscriptionStatus);
router.post("/upgrade", upgradeSubscription);
router.post("/cancel", cancelSubscription);

module.exports = router;

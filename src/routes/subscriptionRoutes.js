const express = require("express");
const {
  getSubscriptionTypes,
  getSubscriptionStatus,
  upgradeSubscription,
  cancelSubscription,
  createPayment,
  verifyPayment
} = require("../controllers/subscriptionController");
const { protect, checkSubscription } = require("../middleware/auth");

const router = express.Router();

// All routes are protected and require an active subscription
router.use(protect);
// router.use(checkSubscription);

// Subscription routes
router.get("/", getSubscriptionTypes);
router.get("/status", getSubscriptionStatus);
router.post("/upgrade", upgradeSubscription);
router.post("/cancel", cancelSubscription);
router.post("/create-payment-order", createPayment);
router.post("/verify-payment", verifyPayment);

module.exports = router;

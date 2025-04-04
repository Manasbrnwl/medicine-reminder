const express = require("express");
const {
  getReminders,
  getReminder,
  createReminder,
  updateReminder,
  deleteReminder,
  getDependentReminders,
  createReminderForDependent,
  markReminderAsTaken,
  markReminderAsMissed,
  snoozeReminder,
  getDashboardStats,
  getDependentDashboardStats
} = require("../controllers/reminderController");
const { protect, checkRelationship } = require("../middleware/auth");

const router = express.Router();

// Protected routes
router.route("/").get(protect, getReminders).post(protect, createReminder);

// Dashboard routes - placing these BEFORE the /:id routes
router.get("/dashboard", protect, getDashboardStats);
router.get(
  "/dashboard/dependent/:dependentId",
  protect,
  getDependentDashboardStats
);

// Dependent routes
router.get("/dependent/:dependentId", protect, getDependentReminders);
router.post("/dependent/:dependentId", protect, createReminderForDependent);

// Reminder routes with ID parameter
router
  .route("/:id")
  .get(protect, getReminder)
  .put(protect, updateReminder)
  .delete(protect, deleteReminder);

// Reminder status routes
router.put("/:id/take", protect, markReminderAsTaken);
router.put("/:id/miss", protect, markReminderAsMissed);
router.put("/:id/snooze", protect, snoozeReminder);

module.exports = router;

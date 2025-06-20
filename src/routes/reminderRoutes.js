const express = require("express");
const {
  getReminders,
  getReminder,
  createReminder,
  updateReminder,
  deleteReminder,
  getDependentReminders,
  createReminderForDependent,
  markMedicineAsTaken,
  markMedicineAsMissed,
  snoozeReminder,
  getDashboardStats,
  getDependentDashboardStats,
  scheduleRemindersInDateRange,
  scheduleAllUserReminders,
  getRemindersWithMedicineDetails,
  removeDuplicateReminders
} = require("../controllers/reminderController");
const {
  protect,
  checkRelationship,
  checkSubscription
} = require("../middleware/auth");

const router = express.Router();

// Route for removing duplicate reminders
router.delete("/delete-duplicates", removeDuplicateReminders);

// Protected routes
router.use(protect);
// router.use(checkSubscription);

// Get all reminders or create new one
router.route("/").get(getReminders).post(checkSubscription, createReminder);

// Dashboard routes - placing these BEFORE the /:id routes
router.get("/dashboard", getDashboardStats);
router.get(
  "/dashboard/dependent/:dependentId",
  checkSubscription,
  checkRelationship,
  getDependentDashboardStats
);

// Get reminders with medicine details
router.get("/with-medicine-details", getRemindersWithMedicineDetails);

// Add new route for scheduling reminders within a date range
router.post("/schedule", scheduleRemindersInDateRange);

// Schedule all of a user's active reminders
router.post("/schedule/user", scheduleAllUserReminders);

// Dependent routes
router.get("/dependent/:dependentId", checkRelationship, getDependentReminders);
router.post(
  "/dependent/:dependentId",
  checkRelationship,
  createReminderForDependent
);

// Reminder routes with ID parameter
router
  .route("/:id")
  .get(getReminder)
  .put(updateReminder)
  .delete(deleteReminder);

// Reminder status routes
router.put("/:id/take", checkSubscription, markMedicineAsTaken);
router.put("/:id/miss", markMedicineAsMissed);
router.put("/:id/snooze", snoozeReminder);

module.exports = router;

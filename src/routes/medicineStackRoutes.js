const express = require("express");
const {
  getMedicineStack,
  getMedicineStackItem,
  addToMedicineStack,
  updateMedicineStackItem,
  incrementUsage
} = require("../controllers/medicineStackController");
const { protect, checkSubscription } = require("../middleware/auth");

const router = express.Router();

// Protected routes
router.use(protect);
router.use(checkSubscription);

// Get all medicines in stack or add new one
router.route("/").get(getMedicineStack).post(addToMedicineStack);

// Specific medicine stack item
router.route("/:id").get(getMedicineStackItem).put(updateMedicineStackItem);

// Increment usage counter
router.route("/:id/increment-usage").put(incrementUsage);

module.exports = router;

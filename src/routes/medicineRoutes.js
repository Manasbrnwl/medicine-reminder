const express = require("express");
const {
  getMedicines,
  getMedicine,
  deleteMedicine,
  getDependentMedicines,
  updateMedicine
} = require("../controllers/medicineController");
const {
  protect,
  checkRelationship,
  checkSubscription
} = require("../middleware/auth");

const router = express.Router();

// Protected routes
router.use(protect);

// Get all medicines or add new one
router.route("/").get(getMedicines);

// Get medicines for a dependent
router.get(
  "/dependent/:dependentId",
  checkSubscription,
  checkRelationship,
  getDependentMedicines
);

// Get, update or delete specific medicine
router
  .route("/:id")
  .get(getMedicine)
  .put(checkSubscription, updateMedicine)
  .delete(deleteMedicine);

module.exports = router;

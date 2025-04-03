const express = require("express");
const {
  getMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getDependentMedicines,
  createMedicineForDependent
} = require("../controllers/medicineController");
const { protect, checkRelationship } = require("../middleware/auth");

const router = express.Router();

// Protected routes
router.route("/").get(protect, getMedicines).post(protect, createMedicine);

router
  .route("/:id")
  .get(protect, getMedicine)
  .put(protect, updateMedicine)
  .delete(protect, deleteMedicine);

// Dependent routes
router.get("/dependent/:dependentId", protect, getDependentMedicines);
router.post("/dependent/:dependentId", protect, createMedicineForDependent);

module.exports = router;

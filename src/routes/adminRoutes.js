const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const { getUsers, deleteUser, paymentDetails } = require("../controllers/adminController");

const router = express.Router();

// Protected routes
router.use(protect);

// Admin routes
router.use(authorize("admin"));

router.get("/users", getUsers);
router.delete("/users/:id", deleteUser);
router.get("/payment", paymentDetails);

module.exports = router;

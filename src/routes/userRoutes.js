const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  linkDependent,
  unlinkDependent,
  getDependents
} = require("../controllers/userController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.post("/", registerUser);
router.post("/login", loginUser);

// Protected routes
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.post("/link-dependent", protect, linkDependent);
router.delete("/unlink-dependent/:dependentId", protect, unlinkDependent);
router.get("/dependents", protect, getDependents);

module.exports = router;

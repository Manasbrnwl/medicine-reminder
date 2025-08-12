const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  linkDependent,
  unlinkDependent,
  getDependents,
  verifyOTPAndLogin,
  requestOTP,
  updateFCMToken,
  logoutUser,
  loginGoogleUser,
  deleteUser
} = require("../controllers/userController");
const { protect, checkSubscription } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.post("/", registerUser);
router.post("/login", loginUser);
router.post("/login/google", loginGoogleUser);
router.post("/request-otp", requestOTP);
router.post("/verify-otp", verifyOTPAndLogin);
router.get("/logout", protect, logoutUser);

// Protected routes
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.put("/fcm-token", protect, updateFCMToken);
router.post("/link-dependent", protect, checkSubscription, linkDependent);
router.delete("/unlink-dependent/:dependentId", protect, unlinkDependent);
router.get("/dependents", protect, getDependents);
router.delete("/", protect, deleteUser);


module.exports = router;

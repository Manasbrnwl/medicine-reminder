const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { generateAndSaveOTP, verifyOTP } = require("../../utils/otp");
const { getFirebaseAdmin } = require("../../utils/firebase");

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d"
  });
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, notificationPreferences } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phone,
      notificationPreferences: notificationPreferences || undefined
    });

    const token = generateToken(user._id);
    user.jwtToken = token;
    user.save();

    if (user) {
      res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          notificationPreferences: user.notificationPreferences,
          token
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid user data"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email })
      .select("+password")
      .populate("dependents", "_id name email phone");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const token = generateToken(user._id);
    user.jwtToken = token;
    user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        parent: user.parent,
        dependents: user.dependents.map((data) => ({
          _id: data._id,
          name: data.name,
          email: data.email,
          phone: data.phone
        })),
        notificationPreferences: user.notificationPreferences,
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    // req.user comes from the auth middleware
    const user = await User.findById(req.user.id)
      .populate("dependents", "name email phone")
      .populate("parent", "name email phone");

    if (user) {
      res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email || '',
          phone: user.phone || '',
          role: user.role,
          parent: user.parent,
          dependents: user.dependents,
          subscription: {
            status: user.subscription.status,
            end: user.subscription.endDate
          },
          notificationPreferences: user.notificationPreferences,
          createdAt: user.createdAt
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.phone = req.body.phone || user.phone;

      if (req.body.notificationPreferences) {
        user.notificationPreferences = {
          ...user.notificationPreferences,
          ...req.body.notificationPreferences
        };
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        success: true,
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          role: updatedUser.role,
          notificationPreferences: updatedUser.notificationPreferences,
          token: generateToken(updatedUser._id)
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Link a dependent to a parent
// @route   POST /api/users/link-dependent
// @access  Private
exports.linkDependent = async (req, res) => {
  try {
    const { dependentEmail } = req.body;
    const parentId = req.user.id;

    // Find the dependent by email
    const dependent = await User.findOne({ email: dependentEmail });
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    // Check if the dependent is user itself
    if (parentId === dependent._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot link a user to themselves"
      });
    }

    // Check if already linked
    const parent = await User.findById(parentId);
    if (parent.dependents.includes(dependent._id)) {
      return res.status(400).json({
        success: false,
        message: "Already linked to this dependent"
      });
    }

    // Add dependent to parent's dependents array
    await parent.addDependent(dependent._id);

    // Set parent for the dependent
    await User.setParent(dependent._id, parentId);

    res.json({
      success: true,
      message: "Successfully linked with dependent"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Unlink a dependent from a parent
// @route   DELETE /api/users/unlink-dependent/:dependentId
// @access  Private
exports.unlinkDependent = async (req, res) => {
  try {
    const { dependentId } = req.params;
    const parentId = req.user.id;

    // Find parent and update dependents array
    const parent = await User.findById(parentId);
    if (!parent.dependents.includes(dependentId)) {
      return res.status(400).json({
        success: false,
        message: "Not linked to this dependent"
      });
    }

    // Remove dependent from parent's dependents array
    parent.dependents = parent.dependents.filter(
      (id) => id.toString() !== dependentId
    );
    await parent.save();

    // Remove parent from dependent
    await User.findByIdAndUpdate(dependentId, { parent: null });

    res.json({
      success: true,
      message: "Successfully unlinked dependent"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get all dependents of a parent
// @route   GET /api/users/dependents
// @access  Private
exports.getDependents = async (req, res) => {
  try {
    const parentId = req.user.id;

    // Find all dependents
    const parent = await User.findById(parentId).populate("dependents");

    res.json({
      success: true,
      count: parent.dependents.length,
      data: parent.dependents.map((dependent) => ({
        _id: dependent._id,
        name: dependent.name,
        email: dependent.email,
        phone: dependent.phone
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Request OTP via email
// @route   POST /api/users/request-otp-email
// @access  Public
exports.requestOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let result;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email"
      });
    }
    if (emailRegex.test(email)) {
      result = await generateAndSaveOTP(email, true);
    } else {
      result = await generateAndSaveOTP(email, false);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    res.json({
      success: true,
      message: result.message,
      data: {
        userId: result.userId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Verify OTP and login
// @route   POST /api/users/verify-otp
// @access  Public
exports.verifyOTPAndLogin = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Please provide userId and OTP"
      });
    }

    const result = await verifyOTP(userId, otp);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    // OTP verification successful, create token and log user in
    const user = await result.user.populate(
      "dependents",
      "_id name email phone"
    );

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        parent: user.parent,
        dependents: user.dependents.map((data) => ({
          _id: data._id,
          name: data.name,
          email: data.email,
          phone: data.phone
        })),
        notificationPreferences: user.notificationPreferences,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Update user's FCM token
// @route   PUT /api/users/fcm-token
// @access  Private
exports.updateFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { fcmToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "FCM token updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Logout user
// @route   PUT /api/users/logout
// @access  Private
exports.logoutUser = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.token = null;
  user.fcmToken = null;
  await user.save();

  res.json({ message: "Logout successful" });
};

exports.loginGoogleUser = async (req, res) => {
  try {
    const { fcmToken, idToken } = req.body;
    if (!idToken || !fcmToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token and FCM token are required"
      });
    }
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { user_id, email, name } = decodedToken;

    let user = await User.findOne({ firebaseUid: user_id });
    if (!user) {
      user = await User.create({
        firebaseUid: user_id,
        name,
        email,
        password: "Health@123$%MVP321%$"
      });
    }
    const token = generateToken(user._id);
    user.jwtToken = token;
    user.fcmToken = fcmToken;
    user.save();
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        parent: user.parent,
        dependents: user.dependents.map((data) => ({
          _id: data._id,
          name: data.name,
          email: data.email,
          phone: data.phone
        })),
        notificationPreferences: user.notificationPreferences,
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

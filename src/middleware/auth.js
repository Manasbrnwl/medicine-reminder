const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(" ")[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route"
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id);

    if (!token || req.user.jwtToken != token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route"
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route"
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Check subscription status
exports.checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.hasActiveSubscription()) {
      return res.status(403).json({
        success: false,
        message:
          "Your subscription has expired. Please upgrade to continue using the service.",
        data: {
          subscription: user.subscription
        }
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Check parent-child relationship
exports.checkRelationship = async (req, res, next) => {
  try {
    const { dependentId } = req.params;
    const parentId = req.user.id;

    // Check if the user is a parent of the dependent
    const parent = await User.findById(parentId);
    if (!parent.dependents.includes(dependentId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this dependent's data"
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

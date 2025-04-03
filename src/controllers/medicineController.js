const Medicine = require("../models/Medicine");
const User = require("../models/User");

// @desc    Get all medicines for a user
// @route   GET /api/medicines
// @access  Private
exports.getMedicines = async (req, res) => {
  try {
    const userId = req.user.id;
    const medicines = await Medicine.find({ user: userId });

    res.json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get all medicines for a dependent
// @route   GET /api/medicines/dependent/:dependentId
// @access  Private
exports.getDependentMedicines = async (req, res) => {
  try {
    const { dependentId } = req.params;

    // Check if the requesting user is the parent of the dependent
    const dependent = await User.findById(dependentId);
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    if (dependent.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this dependent's data"
      });
    }

    const medicines = await Medicine.find({ user: dependentId });

    res.json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Get a single medicine
// @route   GET /api/medicines/:id
// @access  Private
exports.getMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    // Make sure user owns the medicine or is parent of the medicine owner
    const isOwner = medicine.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, medicine.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this medicine"
      });
    }

    res.json({
      success: true,
      data: medicine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Create a new medicine
// @route   POST /api/medicines
// @access  Private
exports.createMedicine = async (req, res) => {
  try {
    // Add user to req.body
    req.body.user = req.user.id;

    const medicine = await Medicine.create(req.body);

    res.status(201).json({
      success: true,
      data: medicine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Create a medicine for a dependent
// @route   POST /api/medicines/dependent/:dependentId
// @access  Private
exports.createMedicineForDependent = async (req, res) => {
  try {
    const { dependentId } = req.params;

    // Check if the requesting user is the parent of the dependent
    const dependent = await User.findById(dependentId);
    if (!dependent) {
      return res.status(404).json({
        success: false,
        message: "Dependent not found"
      });
    }

    if (dependent.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to create medicine for this dependent"
      });
    }

    // Add dependent as user to req.body
    req.body.user = dependentId;

    const medicine = await Medicine.create(req.body);

    res.status(201).json({
      success: true,
      data: medicine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Update a medicine
// @route   PUT /api/medicines/:id
// @access  Private
exports.updateMedicine = async (req, res) => {
  try {
    let medicine = await Medicine.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    // Make sure user owns the medicine or is parent of the medicine owner
    const isOwner = medicine.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, medicine.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this medicine"
      });
    }

    medicine = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.json({
      success: true,
      data: medicine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Delete a medicine
// @route   DELETE /api/medicines/:id
// @access  Private
exports.deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    // Make sure user owns the medicine or is parent of the medicine owner
    const isOwner = medicine.user.toString() === req.user.id;
    const isParent = await isParentOfUser(req.user.id, medicine.user);

    if (!isOwner && !isParent) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this medicine"
      });
    }

    await medicine.deleteOne();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Helper to check if a user is a parent of another user
const isParentOfUser = async (parentId, userId) => {
  try {
    const user = await User.findById(userId);
    return user && user.parent && user.parent.toString() === parentId;
  } catch (error) {
    return false;
  }
};

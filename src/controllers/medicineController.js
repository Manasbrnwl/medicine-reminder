const Medicine = require("../models/Medicine");
const User = require("../models/User");

// @desc    Get all medicines for a user
// @route   GET /api/medicines
// @access  Private
exports.getMedicines = async (req, res) => {
  try {
    // Allow filtering by active status
    const { active } = req.query;
    const queryObj = { user: req.user.id };

    if (active !== undefined) {
      queryObj.active = active === "true";
    }

    const medicines = await Medicine.find(queryObj)
      .select("_id name dosage category")
      .sort({ createdAt: -1, name: 1 });

    res.json({
      success: true,
      count: medicines.length,
      data: medicines,
      baseURL: `${req.protocol}://${req.get("host")}/images/`
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

    // Check if the current user is a parent of the dependent
    const medicines = await Medicine.find({ user: dependentId })
      .select("_id name dosage category")
      .sort({ createdAt: -1 });

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
    const medicine = await Medicine.findById(req.params.id).select(
      "_id name dosage category"
    );

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    // Check if the medicine belongs to the user
    if (medicine.user.toString() !== req.user.id) {
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

    // Check if the medicine belongs to the user
    if (medicine.user.toString() !== req.user.id) {
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

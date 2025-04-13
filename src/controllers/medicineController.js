const Medicine = require("../models/Medicine");
const MedicineStack = require("../models/MedicineStack");
const { incrementUsage } = require("./medicineStackController");
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
      .populate({
        path: "medicineStack",
        select: "name description category"
      })
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

// @desc    Get all medicines for a dependent
// @route   GET /api/medicines/dependent/:dependentId
// @access  Private
exports.getDependentMedicines = async (req, res) => {
  try {
    const { dependentId } = req.params;

    // Check if the current user is a parent of the dependent
    const medicines = await Medicine.find({ user: dependentId })
      .populate({
        path: "medicineStack",
        select: "name description category"
      })
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
    const medicine = await Medicine.findById(req.params.id).populate({
      path: "medicineStack",
      select: "name description category"
    });

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

// @desc    Add a medicine for a user
// @route   POST /api/medicines
// @access  Private
exports.addMedicine = async (req, res) => {
  try {
    const { medicineStackId, dosage, instructions, startDate, endDate } =
      req.body;

    // Check if the medicine stack item exists
    const medicineStackItem = await MedicineStack.findById(medicineStackId);
    if (!medicineStackItem) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found in the medicine stack"
      });
    }

    // Check if the user already has this medicine
    const existingMedicine = await Medicine.findOne({
      user: req.user.id,
      medicineStack: medicineStackId
    });

    if (existingMedicine) {
      return res.status(400).json({
        success: false,
        message: "This medicine is already in your list"
      });
    }

    // Create the medicine
    const medicine = await Medicine.create({
      medicineStack: medicineStackId,
      user: req.user.id,
      dosage,
      instructions,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      active: true
    });

    // Increment the usage counter for the medicine stack item
    await MedicineStack.findByIdAndUpdate(medicineStackId, {
      $inc: { usage: 1 }
    });

    const populatedMedicine = await Medicine.findById(medicine._id).populate({
      path: "medicineStack",
      select: "name description category"
    });

    res.status(201).json({
      success: true,
      data: populatedMedicine
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
    const { dosage, instructions, startDate, endDate, active } = req.body;

    let medicine = await Medicine.findById(req.params.id);

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
        message: "Not authorized to update this medicine"
      });
    }

    medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      {
        dosage: dosage !== undefined ? dosage : medicine.dosage,
        instructions:
          instructions !== undefined ? instructions : medicine.instructions,
        startDate: startDate !== undefined ? startDate : medicine.startDate,
        endDate: endDate !== undefined ? endDate : medicine.endDate,
        active: active !== undefined ? active : medicine.active
      },
      { new: true, runValidators: true }
    ).populate({
      path: "medicineStack",
      select: "name description category"
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

const MedicineStack = require("../models/MedicineStack");

// @desc    Get all medicines in the stack
// @route   GET /api/medicine-stack
// @access  Private
exports.getMedicineStack = async (req, res) => {
  try {
    // Allow filtering, sorting, and pagination
    const {
      category,
      sort = "usage",
      page = 1,
      limit = 20,
      search
    } = req.query;
    const queryObj = {};

    // Add category filter if provided
    if (category) {
      queryObj.category = category;
    }

    // Add search functionality
    if (search) {
      queryObj.name = { $regex: search, $options: "i" };
    }

    // Get total count for pagination
    const total = await MedicineStack.countDocuments(queryObj);

    // Build query
    let query = MedicineStack.find(queryObj);

    // Sort
    if (sort === "name") {
      query = query.sort("name");
    } else if (sort === "-name") {
      query = query.sort("-name");
    } else if (sort === "createdAt") {
      query = query.sort("createdAt");
    } else if (sort === "-createdAt") {
      query = query.sort("-createdAt");
    } else {
      // Default sort by usage (most used first)
      query = query.sort("-usage");
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    query = query.skip(skip).limit(parseInt(limit));

    const medicines = await query;

    res.json({
      success: true,
      count: medicines.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
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

// @desc    Get a single medicine from the stack
// @route   GET /api/medicine-stack/:id
// @access  Private
exports.getMedicineStackItem = async (req, res) => {
  try {
    const medicine = await MedicineStack.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
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

// @desc    Add a medicine to the stack
// @route   POST /api/medicine-stack
// @access  Private
exports.addToMedicineStack = async (req, res) => {
  try {
    const { name, description, category } = req.body;

    // Check if medicine already exists
    const existingMedicine = await MedicineStack.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }
    });

    if (existingMedicine) {
      return res.status(400).json({
        success: false,
        message: "Medicine already exists in the stack"
      });
    }

    const medicine = await MedicineStack.create({
      name,
      description,
      category,
      createdBy: req.user.id
    });

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

// @desc    Update a medicine in the stack
// @route   PUT /api/medicine-stack/:id
// @access  Private
exports.updateMedicineStackItem = async (req, res) => {
  try {
    const { name, description, category } = req.body;
    const medicine = await MedicineStack.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
      });
    }

    // If user is not an admin or the creator, they can't update it
    if (
      req.user.role !== "admin" &&
      medicine.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this medicine"
      });
    }

    // If name is being changed, check if new name already exists
    if (name && name !== medicine.name) {
      const existingMedicine = await MedicineStack.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") }
      });

      if (existingMedicine) {
        return res.status(400).json({
          success: false,
          message: "Medicine with that name already exists in the stack"
        });
      }
    }

    const updatedMedicine = await MedicineStack.findByIdAndUpdate(
      req.params.id,
      { name, description, category },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedMedicine
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// @desc    Increment usage counter for a medicine
// @route   PUT /api/medicine-stack/:id/increment-usage
// @access  Private
exports.incrementUsage = async (req, res) => {
  try {
    const medicine = await MedicineStack.findByIdAndUpdate(
      req.params.id,
      { $inc: { usage: 1 } },
      { new: true }
    );

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found"
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

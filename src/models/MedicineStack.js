const mongoose = require("mongoose");

const MedicineStackSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a medicine name"],
      trim: true,
      unique: true
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: [
        "tablet",
        "capsule",
        "syrup",
        "injection",
        "drops",
        "cream",
        "ointment",
        "other"
      ],
      default: "tablet"
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    usage: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: () => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        return new Date(now.getTime() + istOffset);
      }
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for faster searches
MedicineStackSchema.index({ name: 1 });
MedicineStackSchema.index({ category: 1 });
MedicineStackSchema.index({ usage: -1 });

module.exports = mongoose.model("MedicineStack", MedicineStackSchema);

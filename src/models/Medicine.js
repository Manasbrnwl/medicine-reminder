const mongoose = require("mongoose");

const MedicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    dosage: {
      type: String,
      required: [true, "Please add dosage information"]
    },
    instructions: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      required: true
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

// Compound index for user and medicineStack
MedicineSchema.index({ user: 1, medicineStack: 1 });

// Reverse populate with reminders
MedicineSchema.virtual("reminders", {
  ref: "Reminder",
  localField: "_id",
  foreignField: "medicine",
  justOne: false
});

module.exports = mongoose.model("Medicine", MedicineSchema);

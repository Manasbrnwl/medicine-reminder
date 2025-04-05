const mongoose = require("mongoose");

const MedicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a medicine name"],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    dosage: {
      type: String,
      required: [true, "Please add dosage information"]
    },
    frequency: {
      type: String,
      enum: ["once", "twice", "thrice", "four", "custom"],
      default: "once"
    },
    customFrequency: {
      type: Number,
      min: 1
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date
    },
    instructions: {
      type: String,
      trim: true
    },
    active: {
      type: Boolean,
      default: true
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

// Reverse populate with reminders
MedicineSchema.virtual("reminders", {
  ref: "Reminder",
  localField: "_id",
  foreignField: "medicine",
  justOne: false
});

module.exports = mongoose.model("Medicine", MedicineSchema);

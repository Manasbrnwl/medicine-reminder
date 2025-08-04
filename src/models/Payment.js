const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    amount: {
      type: String,
      required: true
    },
    plan: {
      type: String,
      required: false,
      default: "Basic"
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

PaymentSchema.index({ user: 1 });

module.exports = mongoose.model("Payment", PaymentSchema);

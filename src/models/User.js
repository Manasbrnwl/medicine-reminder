const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { addHoursToDate } = require("../default/common");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"]
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email"
      ]
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false
    },
    phone: {
      type: String,
      match: [/^[0-9]{10,15}$/, "Please add a valid phone number"]
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    // Subscription fields
    subscription: {
      status: {
        type: String,
        enum: ["free", "premium", "expired"],
        default: "free"
      },
      startDate: {
        type: Date,
        default: Date.now
      },
      endDate: {
        type: Date,
        default: () => {
          return addHoursToDate(24 * 30);
        }
      },
      autoRenew: {
        type: Boolean,
        default: false
      },
      paymentMethod: {
        type: String,
        enum: ["none", "card", "upi", "netbanking"],
        default: "none"
      }
    },
    // For parent-child relationship
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    dependents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    notificationPreferences: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    // OTP fields for OTP-based login
    otp: {
      type: String,
      select: false
    },
    otpExpiry: {
      type: Date,
      select: false
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

// Encrypt password using bcrypt
UserSchema.pre("save", async function (next) {
  // Only hash password if it's modified (or new)
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Hash OTP if it's modified
  if (this.isModified("otp") && this.otp) {
    const salt = await bcrypt.genSalt(10);
    this.otp = await bcrypt.hash(this.otp, salt);
  }

  // Check subscription status
  if (
    this.subscription.status === "free" &&
    this.subscription.endDate < new Date()
  ) {
    this.subscription.status = "expired";
  }

  next();
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Match OTP
UserSchema.methods.matchOTP = async function (enteredOTP) {
  return await bcrypt.compare(enteredOTP, this.otp);
};

// Check if OTP is expired
UserSchema.methods.isOTPExpired = function () {
  return Date.now() > this.otpExpiry;
};

// Check if subscription is active
UserSchema.methods.hasActiveSubscription = function () {
  return (
    this.subscription.status === "premium" ||
    (this.subscription.status === "free" &&
      this.subscription.endDate > new Date())
  );
};

// Link a dependent to a parent
UserSchema.methods.addDependent = async function (dependentId) {
  if (!this.dependents.includes(dependentId)) {
    this.dependents.push(dependentId);
    await this.save();
  }
};

// Link a parent to a dependent
UserSchema.statics.setParent = async function (dependentId, parentId) {
  await this.findByIdAndUpdate(dependentId, { parent: parentId });
};

module.exports = mongoose.model("User", UserSchema);

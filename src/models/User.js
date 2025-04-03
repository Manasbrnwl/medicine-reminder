const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Encrypt password using bcrypt
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
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

const Payment = require("../models/Payment");
const User = require("../models/User");

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "user" }).select(
      "id name email phone subscription.status subscription.endDate"
    );
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.paymentDetails = async (req, res) => {
  try {
    const payment = await Payment.find()
      .populate("user")
      .select("id user.email user.name amount plan createdAt");
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.status(200).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

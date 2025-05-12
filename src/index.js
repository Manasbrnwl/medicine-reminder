const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const xss = require("xss-clean");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const { connectRedis } = require("../config/redis");
const schedule = require("node-schedule");
const morgan = require("morgan");
const logger = require("../utils/logger");
const { initializeReminders } = require("../utils/queueService");
const { initializeQueues } = require("../utils/queueService");
const {
  removeDuplicateReminders
} = require("./controllers/reminderController");
const { getFirebaseAdmin } = require("../utils/firebase");

// Load env vars
dotenv.config();

// Initialize Firebase Admin SDK
getFirebaseAdmin();

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Set security headers
app.use(helmet());

// Prevent XSS attacks
app.use(xss());

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Prevent http param pollution
app.use(hpp());

// Dev logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Basic route
app.get("/", (req, res) => {
  res.send("Medicine Reminder API is running");
});

// Routes
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/medicines", require("./routes/medicineRoutes"));
app.use("/api/reminders", require("./routes/reminderRoutes"));
app.use("/api/subscription", require("./routes/subscriptionRoutes"));

//cleanup queues
app.get("/api/cleanup", async (req, res) => {
  try {
    await cleanupQueues();
    res.status(201).json({
      success: true,
      message: "Queues cleaned up successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Initialize all active reminders
const initializeApp = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis
    await connectRedis();

    // Make sure queues are initialized
    await initializeQueues();

    removeDuplicateReminders(1, 1, true);

    // Initialize reminders using queue service
    const count = await initializeReminders();
    logger.info(`Initialized ${count} reminders on startup`);

    // Set up a daily job to refresh reminders
    schedule.scheduleJob("0 0 * * *", async () => {
      // remove any duplicate reminders
      removeDuplicateReminders(1, 1, true);
      const refreshCount = await initializeReminders();
      logger.info(`Daily refresh: Initialized ${refreshCount} reminders`);
    });

    // Also refresh every hour to catch any missed reminders
    schedule.scheduleJob("0 * * * *", async () => {
      const refreshCount = await initializeReminders();
      logger.info(`Hourly refresh: Initialized ${refreshCount} reminders`);
    });

    // Also refresh every 5 minutes to catch any missed reminders
    schedule.scheduleJob("0 */5 * * *", async () => {
      removeDuplicateReminders(1, 1, true);
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Application initialization failed: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  logger.error(`Error: ${err.message}`);
  // Close server & exit process
  process.exit(1);
});

// Initialize the application
initializeApp();

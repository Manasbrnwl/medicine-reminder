const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("../config/db");
const schedule = require("node-schedule");
const morgan = require("morgan");
const logger = require("../utils/logger");
const {
  initializeReminders,
  getQueuesStatus
} = require("../utils/queueService");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

app.use(morgan("dev"));

// Socket.io connection
io.on("connection", (socket) => {
  logger.info("New client connected:", socket.id);

  // Listen for client joining a room (used for personal notifications)
  socket.on("join", (userId) => {
    socket.join(userId);
    logger.info(`User ${userId} joined their personal room`);
  });

  // Listen for client disconnection
  socket.on("disconnect", () => {
    logger.info("Client disconnected:", socket.id);
  });
});

// Global socket.io access for other modules
app.set("io", io);

// Routes
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/medicines", require("./routes/medicineRoutes"));
app.use("/api/medicine-stack", require("./routes/medicineStackRoutes"));
app.use("/api/reminders", require("./routes/reminderRoutes"));
app.use("/api/subscription", require("./routes/subscriptionRoutes"));

// Basic route
app.get("/", (req, res) => {
  res.send("Medicine Reminder API is running");
});

// Health check route with queue status
app.get("/api/health", async (req, res) => {
  try {
    const queueStatus = await getQueuesStatus();
    res.json({
      status: "healthy",
      uptime: process.uptime(),
      timestamp: Date.now(),
      queues: queueStatus
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message
    });
  }
});

// Initialize all active reminders
const initializeApp = async () => {
  try {
    logger.info("Initializing active reminders...");

    // Initialize reminders using queue service
    const count = await initializeReminders(io);

    // Set up a daily job to refresh reminders
    schedule.scheduleJob("0 0 * * *", async () => {
      // Run at midnight every day
      try {
        logger.info("Running daily reminder refresh job");

        // Get current date
        const now = new Date();

        // Set end date to 2 days from now
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 2);

        // Schedule reminders for the next 2 days using queue service
        await initializeReminders(io);

        logger.info("Daily reminder refresh completed successfully");
      } catch (error) {
        logger.error(`Error in daily reminder refresh: ${error.message}`);
      }
    });

    logger.info(`Reminders initialized successfully (${count} scheduled)`);
  } catch (error) {
    logger.error(`Error initializing reminders: ${error.message}`);
  }
};

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  // Initialize reminders after server starts
  initializeApp();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

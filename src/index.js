const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("../config/db");
const { connectRedis } = require("../config/redis");
const schedule = require("node-schedule");
const morgan = require("morgan");
const logger = require("../utils/logger");
const {
  initializeReminders,
  getQueuesStatus,
  setSocketIo
} = require("../utils/queueService");
const path = require("path");

// Load env vars
dotenv.config();

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

// Set the global Socket.IO instance
setSocketIo(io);

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
app.use("/api/reminders", require("./routes/reminderRoutes"));
app.use("/api/subscription", require("./routes/subscriptionRoutes"));

// Basic route
app.get("/", (req, res) => {
  res.send("Medicine Reminder API is running");
});

app.use("/images", express.static(path.join(__dirname, "images")));

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
    // Connect to MongoDB
    await connectDB();
    // Connect to Redis
    await connectRedis();
    // Initialize reminders using queue service
    const count = await initializeReminders(io);

    // Set up a daily job to refresh reminders
    schedule.scheduleJob("0 0 * * *", async () => {
      await initializeReminders(io);
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Application initialization failed: ${error.message}`);
    // logger.error(`Error stack: ${error.stack}`);
    process.exit(1);
  }
};

// Start the application
initializeApp();

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

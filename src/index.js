const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("../config/db");
const schedule = require("node-schedule");
const morgan = require("morgan");
const { initializeReminders } = require("../utils/scheduler");

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
  console.log("New client connected:", socket.id);

  // Listen for client joining a room (used for personal notifications)
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room`);
  });

  // Listen for client disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Global socket.io access for other modules
app.set("io", io);

// Routes
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/medicines", require("./routes/medicineRoutes"));
app.use("/api/reminders", require("./routes/reminderRoutes"));

// Basic route
app.get("/", (req, res) => {
  res.send("Medicine Reminder API is running");
});

// Initialize all active reminders
const initializeApp = async () => {
  try {
    console.log("Initializing active reminders...");
    await initializeReminders(io);
    console.log("Reminders initialized successfully");
  } catch (error) {
    console.error("Error initializing reminders:", error);
  }
};

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  // Initialize reminders after server starts
  initializeApp();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

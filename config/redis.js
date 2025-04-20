const { createClient } = require("redis");
const logger = require("../utils/logger");
require("dotenv").config();

let redisClient = null;

const connectRedis = async () => {
  try {
    // Log the Redis URL (without password for security)
    const redisUrl = process.env.REDIS_URL;

    // Create Redis client with URL and additional options
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error("Redis connection failed after 10 retries");
          }
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 10000,
        // tls: {
        //   rejectUnauthorized: false // Allow self-signed certificates
        // }
      }
    });

    // Handle connection events
    redisClient.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    redisClient.on("reconnecting", () => {
      logger.info("Redis reconnecting...");
    });

    redisClient.on("end", () => {
      logger.info("Redis connection ended");
    });

    // Connect to Redis
    await redisClient.connect();

    // Test the connection
    await redisClient.ping();

    return redisClient;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = {
  connectRedis,
  getRedisClient: () => redisClient
};

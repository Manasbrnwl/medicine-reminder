const { createClient } = require("redis");
const logger = require("../utils/logger");
require("dotenv").config();

let redisClient = null;

const connectRedis = async () => {
  if (redisClient) {
    // If already connected, just return the existing client
    logger.info("Using existing Redis client");
    return redisClient;
  }

  try {
    const redisUrl = process.env.REDIS_URL;

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error("Redis connection failed after 10 retries");
          }
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 10000
        // tls: { rejectUnauthorized: false } // Uncomment if using SSL with self-signed cert
      }
    });

    // Connection events
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

    await redisClient.connect();
    await redisClient.ping();

    // Gracefully handle shutdown
    process.on("SIGINT", async () => {
      logger.info("Closing Redis connection (SIGINT)...");
      await redisClient.quit();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Closing Redis connection (SIGTERM)...");
      await redisClient.quit();
      process.exit(0);
    });

    return redisClient;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    process.exit(1);
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error(
      "Redis client is not connected yet. Call connectRedis() first."
    );
  }
  return redisClient;
};

module.exports = {
  connectRedis,
  getRedisClient
};
const admin = require("firebase-admin");
const logger = require("./logger");

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length) {
      return admin;
    }

    // Initialize the app with service account credentials
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
      })
    });

    logger.info("Firebase Admin SDK initialized successfully");
    return admin;
  } catch (error) {
    logger.error(`Firebase initialization error: ${error.message}`);
    throw error;
  }
};

// Get Firebase Admin instance
const getFirebaseAdmin = (() => {
  let firebaseAdmin = null;
  return () => {
    if (!firebaseAdmin) {
      firebaseAdmin = initializeFirebase();
    }
    return firebaseAdmin;
  };
})();

/**
 * Send FCM notification to a specific user
 * @param {string} fcmToken - User's FCM token
 * @param {object} notification - Notification data
 * @returns {Promise<boolean>} - Success status
 */
const sendFCMNotification = async (fcmToken, notification) => {
  try {
    if (!fcmToken) {
      logger.warn("No FCM token provided for notification");
      return false;
    }

    const admin = getFirebaseAdmin();

    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification?.reminderId
        ? { reminderId: notification.reminderId.toString() }
        : {}
    };

    const response = await admin.messaging().send(message);
    logger.info(`FCM notification sent successfully: ${response}`);
    return true;
  } catch (error) {
    logger.error(`FCM notification error: ${error.message}`);
    return false;
  }
};

module.exports = {
  getFirebaseAdmin,
  sendFCMNotification
};

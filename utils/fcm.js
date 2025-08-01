const admin = require("firebase-admin");
// const path = require("path");
//
// // Adjust the path to your service account key as needed
// const serviceAccount = require(
//   path.join(__dirname, "./serviceAccountKey.json"),
// );
// Use environment variables for Firebase configuration
const serviceAccount = {
  type: process.env.FIREBASE_TYPE || "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri:
    process.env.FIREBASE_AUTH_URI ||
    "https://accounts.google.com/o/oauth2/auth",
  token_uri:
    process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url:
    process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL ||
    "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com",
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

function sendNotification(token, title, body) {
  const message = {
    notification: { title, body },
    token,
  };
  return admin.messaging().send(message);
}

// Helper function to send active status change notifications
async function sendActiveStatusNotification(user, isActive) {
  if (!user.fcmToken) {
    console.log(`No FCM token found for user ${user.email}`);
    return;
  }

  try {
    const notificationTitle = isActive
      ? "Account Activated"
      : "Account Deactivated";
    const notificationBody = isActive
      ? "Your account has been activated. You can now access all features."
      : "Your account has been deactivated. Please contact administrator for assistance.";

    await sendNotification(user.fcmToken, notificationTitle, notificationBody);
  } catch (err) {
    console.error(`❌ FCM notification error for user ${user.email}:`, err);
  }
}

// Helper function to send approval/rejection notifications
async function sendApprovalNotification(user, isApproved) {
  if (!user.fcmToken) {
    console.log(`No FCM token found for user ${user.email}`);
    return;
  }

  try {
    const notificationTitle = isApproved
      ? "Account Approved"
      : "Account Rejected";
    const notificationBody = isApproved
      ? "Your account has been approved and activated. You can now access all features."
      : "Your account has been rejected. Please contact administrator for assistance.";

    console.log(
      `Sending approval notification to ${user.email}: ${isApproved ? "APPROVED" : "REJECTED"}`,
    );

    await sendNotification(user.fcmToken, notificationTitle, notificationBody);
    console.log(
      `✅ Approval notification sent successfully to user ${user.email}`,
    );
  } catch (err) {
    console.error(`❌ FCM notification error for user ${user.email}:`, err);
  }
}

module.exports = {
  sendNotification,
  sendActiveStatusNotification,
  sendApprovalNotification,
};

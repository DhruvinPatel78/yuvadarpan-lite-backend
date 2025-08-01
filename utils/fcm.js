const admin = require("firebase-admin");
const path = require("path");

// Adjust the path to your service account key as needed
const serviceAccount = require(
  path.join(__dirname, "./serviceAccountKey.json"),
);

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

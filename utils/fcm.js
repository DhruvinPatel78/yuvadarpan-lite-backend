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

module.exports = { sendNotification };

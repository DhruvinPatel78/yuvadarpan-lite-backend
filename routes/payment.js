const express = require("express");
const bodyParser = require('body-parser');
const crypto = require('crypto');

const router = express.Router();

router.post("/", async (req, res) => {
    const webhookData = req.body;

    // Cashfree passes the signature in the headers
    const cashfreeSignature = req.headers['x-webhook-signature'];

    // Your Cashfree webhook secret (found in your Cashfree dashboard)
    const secretKey = '8b1392aed1ab188c06d6473613343cae0e795f39';

    // Verify the webhook by comparing the computed HMAC signature
    const computedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(JSON.stringify(webhookData))
        .digest('base64');

    // Check if the signature matches
    if (cashfreeSignature === computedSignature) {
        console.log('Webhook verified');

        // Process the webhook data
        // For example, handle payment status updates
        const event = webhookData.event;
        const orderId = webhookData.orderId;

        if (event === 'PAYMENT_SUCCESS') {
            console.log(`Payment successful for Order ID: ${orderId}`);
            // Add your logic to handle successful payment
        } else if (event === 'PAYMENT_FAILED') {
            console.log(`Payment failed for Order ID: ${orderId}`);
            // Add your logic to handle failed payment
        }

        // Respond with a 200 status code to acknowledge receipt of the webhook
        res.status(200).send('Webhook received');
    } else {
        console.log('Webhook signature verification failed');
        res.status(400).send('Invalid signature');
    }
});

module.exports = router;

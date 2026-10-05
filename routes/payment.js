const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Payment = require("../models/payment");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { findAccountByTokenId } = require("../utils/managerScope");
const {
  ACCESS_PRICE_INR,
  isPaymentEnabled,
  amountInPaisa,
  createCheckoutPayment,
  getCheckoutOrderStatus,
  validatePhonePeCallback,
  describePhonePeError,
} = require("../utils/phonepe");
const {
  normalizeFamilyId,
  findFamilyIdDoc,
  completeAccessPayment,
} = require("../utils/grantFamilyAccess");

const frontendBase = () =>
  String(process.env.FRONTEND_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

const rejectIfPaymentDisabled = (res) => {
  if (isPaymentEnabled()) {
    return false;
  }
  res.status(403).json({
    enabled: false,
    message: "Payment is currently disabled.",
  });
  return true;
};

router.get("/access-price", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res)) return;
  const enabled = isPaymentEnabled();
  res.status(200).json({
    enabled,
    amountInr: ACCESS_PRICE_INR,
    amountPaisa: amountInPaisa(ACCESS_PRICE_INR),
    currency: "INR",
    product: "Yuvadarpan digital access",
  });
});

router.post("/create", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res) || rejectIfPaymentDisabled(res)) return;
  try {
    const account = await findAccountByTokenId(req.user.id);
    if (!account) {
      return res.status(401).json({ message: "Session expired. Sign in again." });
    }
    const role = String(account.role || "").toUpperCase();
    if (role !== "USER") {
      return res
        .status(403)
        .json({ message: "Only members can purchase access." });
    }

    const familyId = normalizeFamilyId(account.familyId);
    if (!familyId) {
      return res.status(400).json({
        message: "Add a Family ID on your profile before purchasing access.",
      });
    }

    const existingFamily = await findFamilyIdDoc(familyId);
    if (existingFamily) {
      return res.status(200).json({
        alreadyUnlocked: true,
        familyId,
        message: "Your Family ID already has access.",
      });
    }

    const openPayment = await Payment.findOne({
      userId: String(account._id),
      familyId,
      status: { $in: ["CREATED", "PENDING"] },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
      redirectUrl: { $exists: true, $ne: "" },
    }).sort({ createdAt: -1 });

    if (openPayment?.redirectUrl) {
      return res.status(200).json({
        merchantOrderId: openPayment.merchantOrderId,
        orderId: openPayment.phonepeOrderId,
        redirectUrl: openPayment.redirectUrl,
        amountInr: openPayment.amountInr || ACCESS_PRICE_INR,
        amountPaisa: openPayment.amountPaisa || amountInPaisa(ACCESS_PRICE_INR),
        state: openPayment.status,
        resumed: true,
      });
    }

    const merchantOrderId = `YD${Date.now()}${crypto
      .randomBytes(3)
      .toString("hex")}`.slice(0, 40);
    const amountPaisa = amountInPaisa(ACCESS_PRICE_INR);
    const redirectUrl = `${frontendBase()}/connect-samaj?payment=${encodeURIComponent(
      merchantOrderId
    )}`;

    const checkout = await createCheckoutPayment({
      merchantOrderId,
      amountPaisa,
      redirectUrl,
      message: "Yuvadarpan Family ID access",
      userId: String(account._id),
      familyId,
    });

    const now = new Date();
    await Payment.create({
      merchantOrderId,
      phonepeOrderId: checkout.orderId || "",
      userId: String(account._id),
      familyId,
      amountInr: ACCESS_PRICE_INR,
      amountPaisa,
      status: checkout.state || "PENDING",
      redirectUrl: checkout.redirectUrl,
      message: "Yuvadarpan Family ID access",
      createdAt: now,
      updatedAt: now,
    });

    if (!checkout.redirectUrl) {
      return res
        .status(502)
        .json({ message: "Could not start PhonePe checkout." });
    }

    res.status(200).json({
      merchantOrderId,
      orderId: checkout.orderId,
      redirectUrl: checkout.redirectUrl,
      amountInr: ACCESS_PRICE_INR,
      amountPaisa,
      state: checkout.state || "PENDING",
    });
  } catch (error) {
    console.error(
      "payment-create-failed",
      error?.type || error?.name,
      error?.httpStatusCode,
      error.message
    );
    if (error.code === "PHONEPE_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    const described = describePhonePeError(error);
    return res.status(502).json({
      message: described.message,
      code: described.code,
    });
  }
});

router.get(
  "/status/:merchantOrderId",
  verifyToken(),
  requireAuth,
  async (req, res) => {
    if (errorCheck(req, res) || rejectIfPaymentDisabled(res)) return;
    try {
      const merchantOrderId = String(req.params.merchantOrderId || "").trim();
      if (!merchantOrderId) {
        return res.status(400).json({ message: "Order id is required." });
      }

      const payment = await Payment.findOne({ merchantOrderId });
      if (!payment) {
        return res.status(404).json({ message: "Payment not found." });
      }
      if (String(payment.userId) !== String(req.user.id)) {
        return res.status(403).json({ message: "You cannot view this payment." });
      }

      if (payment.status === "COMPLETED") {
        return res.status(200).json({
          merchantOrderId,
          status: "COMPLETED",
          familyId: payment.familyId,
          familyIdExists: true,
          amountInr: payment.amountInr,
        });
      }

      let remote;
      try {
        remote = await getCheckoutOrderStatus(merchantOrderId);
      } catch (statusError) {
        console.error("payment-status-failed", statusError.message);
        return res.status(200).json({
          merchantOrderId,
          status: payment.status,
          familyId: payment.familyId,
          familyIdExists: false,
          amountInr: payment.amountInr,
        });
      }

      const remoteState = String(remote?.state || "").toUpperCase();
      if (remoteState === "COMPLETED") {
        await completeAccessPayment({
          payment,
          phonepeOrderId: remote.orderId || payment.phonepeOrderId,
          req,
        });
        return res.status(200).json({
          merchantOrderId,
          status: "COMPLETED",
          familyId: payment.familyId,
          familyIdExists: true,
          amountInr: payment.amountInr,
        });
      }

      if (remoteState === "FAILED") {
        payment.status = "FAILED";
        payment.errorCode = remote.errorCode || payment.errorCode;
        payment.updatedAt = new Date();
        await payment.save();
      } else if (remoteState === "PENDING") {
        payment.status = "PENDING";
        payment.updatedAt = new Date();
        await payment.save();
      }

      res.status(200).json({
        merchantOrderId,
        status: payment.status,
        familyId: payment.familyId,
        familyIdExists: false,
        amountInr: payment.amountInr,
        phonepeState: remoteState,
      });
    } catch (error) {
      console.error("payment-status-route-failed", error.message);
      res.status(500).json({ message: "Could not check payment status." });
    }
  }
);

router.post("/webhook", async (req, res) => {
  // PhonePe validates webhook URLs with a POST and expects 2xx.
  // Keep this reachable even when the payment feature flag is off.
  if (!isPaymentEnabled()) {
    return res.status(200).json({ received: true, enabled: false });
  }

  try {
    const authorization =
      req.get("Authorization") || req.get("authorization") || "";
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

    // Reachability / empty validation probes from PhonePe.
    if (!authorization || rawBody === "{}" || rawBody === "") {
      return res.status(200).json({ received: true, ok: true });
    }

    const callback = validatePhonePeCallback(authorization, rawBody);
    const payload = callback?.payload || {};
    const merchantOrderId = String(
      payload.merchantOrderId || payload.originalMerchantOrderId || ""
    ).trim();
    const state = String(payload.state || "").toUpperCase();

    if (!merchantOrderId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const payment = await Payment.findOne({ merchantOrderId });
    if (!payment) {
      return res.status(200).json({ received: true, missing: true });
    }

    if (state === "COMPLETED") {
      await completeAccessPayment({
        payment,
        phonepeOrderId: payload.orderId || payment.phonepeOrderId,
      });
    } else if (state === "FAILED") {
      payment.status = "FAILED";
      payment.errorCode = payload.errorCode || payment.errorCode;
      payment.updatedAt = new Date();
      await payment.save();
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("payment-webhook-failed", error.message);
    // Still acknowledge so PhonePe does not treat the endpoint as down.
    res.status(200).json({
      received: true,
      error: true,
      message: error.message || "Webhook handling failed.",
    });
  }
});

module.exports = router;

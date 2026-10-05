const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Payment = require("../models/payment");
const Surname = require("../models/surname");
const { verifyToken, errorCheck, requireAuth } = require("../utils/auth");
const { findAccountByTokenId, isAdmin } = require("../utils/managerScope");
const { idOrObjectIdFilter } = require("../utils/childCount");
const { nameText } = require("../utils/masterName");
const {
  ACCESS_PRICE_INR,
  amountInPaisa,
  createCheckoutPayment,
  getCheckoutOrderStatus,
  validatePhonePeCallback,
  describePhonePeError,
} = require("../utils/phonepe");
const {
  getPaymentEnabled,
  setPaymentEnabled,
} = require("../models/appSetting");
const {
  normalizeFamilyId,
  findFamilyIdDoc,
  completeAccessPayment,
} = require("../utils/grantFamilyAccess");

/** Origin only — strip paths like `/login` that break post-payment redirects. */
const frontendBase = () => {
  const raw = String(process.env.FRONTEND_URL || "http://localhost:3000").trim();
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return raw
      .replace(/\/+$/, "")
      .replace(/\/login$/i, "")
      .replace(/\/+$/, "");
  }
};

const paymentReturnUrl = (merchantOrderId) =>
  `${frontendBase()}/connect-samaj?payment=${encodeURIComponent(
    merchantOrderId
  )}`;

const resolveSurnameLabel = async (lastNameRef) => {
  const value = String(lastNameRef || "").trim();
  if (!value) return "";
  try {
    const doc = await Surname.findOne(idOrObjectIdFilter(value)).lean();
    return nameText(doc) || "";
  } catch {
    return "";
  }
};

const userSnapshotFromAccount = async (account) => {
  const firstName = String(account?.firstName || "").trim();
  const middleName = String(account?.middleName || "").trim();
  const lastNameLabel = await resolveSurnameLabel(account?.lastName);
  const userName = [firstName, middleName, lastNameLabel]
    .filter(Boolean)
    .join(" ");
  return {
    userName,
    userEmail: String(account?.email || "").trim().toLowerCase(),
    userMobile: String(account?.mobile || "").trim(),
  };
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const rejectIfPaymentDisabled = async (res) => {
  if (await getPaymentEnabled()) {
    return false;
  }
  res.status(403).json({
    enabled: false,
    message: "Payment is currently disabled.",
  });
  return true;
};

const rejectNonAdmin = (req, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ message: "You cannot do this." });
    return true;
  }
  return false;
};

const looksLikeUnresolvedSurnameId = (userName = "") =>
  /(?:^|\s)[a-f0-9]{24,}(?:\s|$)/i.test(String(userName));

const enrichPaymentRows = async (rows) => {
  const userIds = [...new Set(rows.map((row) => String(row.userId || "")).filter(Boolean))];
  const byId = new Map();
  await Promise.all(
    userIds.map(async (id) => {
      const user = await findAccountByTokenId(id);
      if (user) {
        byId.set(id, await userSnapshotFromAccount(user));
      }
    })
  );

  return rows.map((row) => {
    const live = byId.get(String(row.userId)) || {};
    const storedName = String(row.userName || "").trim();
    const useLiveName =
      live.userName &&
      (!storedName || looksLikeUnresolvedSurnameId(storedName));
    return {
      ...row,
      id: row.id || String(row._id || ""),
      userName: useLiveName ? live.userName : storedName || live.userName || "",
      userEmail: row.userEmail || live.userEmail || "",
      userMobile: row.userMobile || live.userMobile || "",
      purchasedAt: row.paidAt || row.updatedAt || row.createdAt || null,
    };
  });
};

router.get("/access-price", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res)) return;
  const enabled = await getPaymentEnabled();
  res.status(200).json({
    enabled,
    amountInr: ACCESS_PRICE_INR,
    amountPaisa: amountInPaisa(ACCESS_PRICE_INR),
    currency: "INR",
    product: "Yuvadarpan digital access",
  });
});

router.get("/enabled", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) return;
  try {
    const enabled = await getPaymentEnabled();
    res.status(200).json({ enabled });
  } catch (error) {
    console.error("payment-enabled-get-failed", error.message);
    res.status(500).json({ message: "Could not load payment setting." });
  }
});

router.patch("/enabled", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) return;
  try {
    const enabled = Boolean(req.body?.enabled);
    await setPaymentEnabled(enabled, req.user?.id);
    res.status(200).json({
      enabled,
      message: enabled
        ? "Family ID payments are now enabled."
        : "Family ID payments are now disabled.",
    });
  } catch (error) {
    console.error("payment-enabled-set-failed", error.message);
    res.status(500).json({ message: "Could not update payment setting." });
  }
});

router.get("/report", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res) || rejectNonAdmin(req, res)) return;
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const query = {};
    if (status && status !== "ALL") {
      query.status = status;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { merchantOrderId: rx },
        { phonepeOrderId: rx },
        { familyId: rx },
        { userName: rx },
        { userEmail: rx },
        { userMobile: rx },
        { userId: rx },
      ];
    }

    const dateFilter = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        dateFilter.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDate;
      }
    }
    if (Object.keys(dateFilter).length) {
      query.createdAt = dateFilter;
    }

    const summaryMatch = { ...query, status: "COMPLETED" };

    const [rawRows, total, completedAgg] = await Promise.all([
      Payment.find(query)
        .sort({ paidAt: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Payment.countDocuments(query),
      Payment.aggregate([
        { $match: summaryMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amountInr: { $sum: "$amountInr" },
          },
        },
      ]),
    ]);

    const data = await enrichPaymentRows(rawRows);
    const completed = completedAgg[0] || { count: 0, amountInr: 0 };

    res.status(200).json({
      total,
      page,
      totalPages: Math.ceil(total / limit) || 0,
      data,
      summary: {
        completedCount: completed.count || 0,
        completedAmountInr: completed.amountInr || 0,
      },
    });
  } catch (error) {
    console.error("payment-report-failed", error.message);
    res.status(500).json({ message: "Could not load purchase report." });
  }
});

router.post("/create", verifyToken(), requireAuth, async (req, res) => {
  if (errorCheck(req, res) || (await rejectIfPaymentDisabled(res))) return;
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

    // Do not resume older checkouts — their PhonePe redirectUrl may point at a
    // bad path (e.g. /login/connect-samaj) if FRONTEND_URL was misconfigured.
    await Payment.updateMany(
      {
        userId: String(account._id),
        familyId,
        status: { $in: ["CREATED", "PENDING"] },
      },
      { $set: { status: "EXPIRED", updatedAt: new Date() } }
    );

    const merchantOrderId = `YD${Date.now()}${crypto
      .randomBytes(3)
      .toString("hex")}`.slice(0, 40);
    const amountPaisa = amountInPaisa(ACCESS_PRICE_INR);
    const redirectUrl = paymentReturnUrl(merchantOrderId);

    const checkout = await createCheckoutPayment({
      merchantOrderId,
      amountPaisa,
      redirectUrl,
      message: "Yuvadarpan Family ID access",
      userId: String(account._id),
      familyId,
    });

    const now = new Date();
    const userSnapshot = await userSnapshotFromAccount(account);
    await Payment.create({
      merchantOrderId,
      phonepeOrderId: checkout.orderId || "",
      userId: String(account._id),
      ...userSnapshot,
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
    if (errorCheck(req, res)) return;
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
        // Re-run grant in case an earlier COMPLETED missed Family ID creation.
        const account = await findAccountByTokenId(req.user.id);
        await completeAccessPayment({
          payment,
          req,
          userSnapshot: account ? await userSnapshotFromAccount(account) : null,
        });
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
        const account = await findAccountByTokenId(req.user.id);
        await completeAccessPayment({
          payment,
          phonepeOrderId: remote.orderId || payment.phonepeOrderId,
          req,
          userSnapshot: account ? await userSnapshotFromAccount(account) : null,
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
  // Always process callbacks so in-flight payments can complete even if
  // new checkouts are disabled from Settings.
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

const {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
  MetaInfo,
} = require("@phonepe-pg/pg-sdk-node");

const ACCESS_PRICE_INR = Math.max(
  1,
  Number(process.env.ACCESS_PRICE_INR || 100) || 100
);

const isPaymentEnabled = () => {
  const raw = String(process.env.PAYMENT_ENABLED || "false")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

const getPhonePeClient = () => {
  const clientId = String(process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = Number(process.env.PHONEPE_CLIENT_VERSION || 1) || 1;
  const envName = String(process.env.PHONEPE_ENV || "SANDBOX")
    .trim()
    .toUpperCase();

  if (!clientId || !clientSecret) {
    const error = new Error(
      "PhonePe is not configured. Set PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET."
    );
    error.code = "PHONEPE_NOT_CONFIGURED";
    throw error;
  }

  try {
    return StandardCheckoutClient.getInstance(
      clientId,
      clientSecret,
      clientVersion,
      envName === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX
    );
  } catch (error) {
    // Re-init can throw if env/credentials changed after first getInstance.
    if (
      error?.message &&
      /already|instance|initialized/i.test(String(error.message))
    ) {
      return StandardCheckoutClient.getInstance(
        clientId,
        clientSecret,
        clientVersion,
        envName === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX
      );
    }
    throw error;
  }
};

const describePhonePeError = (error) => {
  const status = error?.httpStatusCode || error?.statusCode;
  const type = error?.type || error?.name || "";
  if (status === 403 || type === "ForbiddenAccess") {
    return {
      code: "PHONEPE_FORBIDDEN",
      message:
        "PhonePe rejected the credentials (Forbidden). Verify PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION, and PHONEPE_ENV match Developer Settings for Payment Gateway (V2).",
    };
  }
  if (status === 401 || type === "UnauthorizedAccess") {
    return {
      code: "PHONEPE_UNAUTHORIZED",
      message:
        "PhonePe authorization failed. Check client credentials and environment.",
    };
  }
  return {
    code: error?.code || "PHONEPE_ERROR",
    message:
      error?.message ||
      "Could not start payment with PhonePe. Please try again.",
  };
};

const amountInPaisa = (inr = ACCESS_PRICE_INR) =>
  Math.round(Number(inr) * 100);

const createCheckoutPayment = async ({
  merchantOrderId,
  amountPaisa,
  redirectUrl,
  message,
  userId,
  familyId,
}) => {
  const client = getPhonePeClient();
  const metaInfo = MetaInfo.builder()
    .udf1(String(userId || ""))
    .udf2(String(familyId || ""))
    .udf3("family_access")
    .build();

  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(amountPaisa)
    .redirectUrl(redirectUrl)
    .message(message || "Yuvadarpan access")
    .metaInfo(metaInfo)
    .build();

  return client.pay(request);
};

const getCheckoutOrderStatus = async (merchantOrderId) => {
  const client = getPhonePeClient();
  return client.getOrderStatus(merchantOrderId, true);
};

const validatePhonePeCallback = (authorization, responseBody) => {
  const username = String(process.env.PHONEPE_WEBHOOK_USERNAME || "").trim();
  const password = String(process.env.PHONEPE_WEBHOOK_PASSWORD || "").trim();
  if (!username || !password) {
    const error = new Error(
      "PhonePe webhook credentials are not configured."
    );
    error.code = "PHONEPE_WEBHOOK_NOT_CONFIGURED";
    throw error;
  }
  const client = getPhonePeClient();
  return client.validateCallback(
    username,
    password,
    String(authorization || ""),
    typeof responseBody === "string"
      ? responseBody
      : JSON.stringify(responseBody || {})
  );
};

module.exports = {
  ACCESS_PRICE_INR,
  isPaymentEnabled,
  amountInPaisa,
  createCheckoutPayment,
  getCheckoutOrderStatus,
  validatePhonePeCallback,
  describePhonePeError,
};

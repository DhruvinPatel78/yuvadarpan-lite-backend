const crypto = require("crypto");

const ACCESS_PRICE_INR = Math.max(
  1,
  Number(process.env.ACCESS_PRICE_INR || 100) || 100
);

let cachedToken = null;

const isPaymentEnabled = () => {
  const raw = String(process.env.PAYMENT_ENABLED || "false")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

const isProductionEnv = () =>
  String(process.env.PHONEPE_ENV || "SANDBOX")
    .trim()
    .toUpperCase() === "PRODUCTION";

const phonePeHosts = () => {
  if (isProductionEnv()) {
    return {
      auth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
      pay: "https://api.phonepe.com/apis/pg/checkout/v2/pay",
      status: (merchantOrderId) =>
        `https://api.phonepe.com/apis/pg/checkout/v2/order/${encodeURIComponent(
          merchantOrderId
        )}/status?details=true`,
    };
  }
  return {
    auth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    pay: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
    status: (merchantOrderId) =>
      `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${encodeURIComponent(
        merchantOrderId
      )}/status?details=true`,
  };
};

const getCredentials = () => {
  const clientId = String(process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = String(process.env.PHONEPE_CLIENT_VERSION || "1").trim();
  if (!clientId || !clientSecret) {
    const error = new Error(
      "PhonePe is not configured. Set PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET."
    );
    error.code = "PHONEPE_NOT_CONFIGURED";
    throw error;
  }
  return { clientId, clientSecret, clientVersion };
};

const amountInPaisa = (inr = ACCESS_PRICE_INR) =>
  Math.round(Number(inr) * 100);

const describePhonePeError = (error) => {
  const status = error?.httpStatusCode || error?.statusCode;
  if (status === 403) {
    return {
      code: "PHONEPE_FORBIDDEN",
      message:
        "PhonePe rejected the credentials (Forbidden). Verify PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION, and PHONEPE_ENV match Developer Settings for Payment Gateway (V2).",
    };
  }
  if (status === 401) {
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

const readJsonSafe = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const phonePeRequestError = (response, body, fallbackMessage) => {
  const message =
    body?.message ||
    body?.error ||
    body?.raw ||
    fallbackMessage ||
    `PhonePe request failed (${response.status})`;
  const error = new Error(String(message));
  error.httpStatusCode = response.status;
  error.code = body?.code || "PHONEPE_HTTP_ERROR";
  error.data = body;
  return error;
};

const getAccessToken = async (forceRefresh = false) => {
  const now = Math.floor(Date.now() / 1000);
  if (
    !forceRefresh &&
    cachedToken?.accessToken &&
    cachedToken.expiresAt &&
    cachedToken.expiresAt - 60 > now
  ) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret, clientVersion } = getCredentials();
  const hosts = phonePeHosts();
  const body = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(hosts.auth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await readJsonSafe(response);
  if (!response.ok || !data?.access_token) {
    throw phonePeRequestError(
      response,
      data,
      "Could not fetch PhonePe auth token."
    );
  }

  cachedToken = {
    accessToken: data.access_token,
    tokenType: data.token_type || "O-Bearer",
    expiresAt: Number(data.expires_at) || now + 3000,
  };
  return cachedToken.accessToken;
};

const authHeader = async () => {
  const token = await getAccessToken();
  const type = cachedToken?.tokenType || "O-Bearer";
  return `${type} ${token}`;
};

const createCheckoutPayment = async ({
  merchantOrderId,
  amountPaisa,
  redirectUrl,
  message,
  userId,
  familyId,
}) => {
  const hosts = phonePeHosts();
  const payload = {
    merchantOrderId,
    amount: amountPaisa,
    expireAfter: 1200,
    metaInfo: {
      udf1: String(userId || ""),
      udf2: String(familyId || ""),
      udf3: "family_access",
    },
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: message || "Yuvadarpan access",
      merchantUrls: {
        redirectUrl,
      },
    },
  };

  const response = await fetch(hosts.pay, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: await authHeader(),
    },
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    // Retry once on auth failure with a fresh token.
    if (response.status === 401) {
      await getAccessToken(true);
      const retry = await fetch(hosts.pay, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: await authHeader(),
        },
        body: JSON.stringify(payload),
      });
      const retryData = await readJsonSafe(retry);
      if (!retry.ok) {
        throw phonePeRequestError(
          retry,
          retryData,
          "Could not create PhonePe checkout."
        );
      }
      return {
        orderId: retryData.orderId,
        state: retryData.state,
        expireAt: retryData.expireAt,
        redirectUrl: retryData.redirectUrl,
      };
    }
    throw phonePeRequestError(
      response,
      data,
      "Could not create PhonePe checkout."
    );
  }

  return {
    orderId: data.orderId,
    state: data.state,
    expireAt: data.expireAt,
    redirectUrl: data.redirectUrl,
  };
};

const getCheckoutOrderStatus = async (merchantOrderId) => {
  const hosts = phonePeHosts();
  const response = await fetch(hosts.status(merchantOrderId), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: await authHeader(),
    },
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    if (response.status === 401) {
      await getAccessToken(true);
      const retry = await fetch(hosts.status(merchantOrderId), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: await authHeader(),
        },
      });
      const retryData = await readJsonSafe(retry);
      if (!retry.ok) {
        throw phonePeRequestError(
          retry,
          retryData,
          "Could not fetch PhonePe order status."
        );
      }
      return retryData;
    }
    throw phonePeRequestError(
      response,
      data,
      "Could not fetch PhonePe order status."
    );
  }
  return data;
};

const normalizeAuthHeader = (value) =>
  String(value || "")
    .trim()
    .replace(/^sha256\s+/i, "")
    .replace(/^bearer\s+/i, "")
    .trim()
    .toLowerCase();

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

  const expected = crypto
    .createHash("sha256")
    .update(`${username}:${password}`)
    .digest("hex")
    .toLowerCase();
  const received = normalizeAuthHeader(authorization);
  if (!received || received !== expected) {
    const error = new Error("Invalid PhonePe webhook authorization.");
    error.code = "PHONEPE_WEBHOOK_INVALID";
    throw error;
  }

  const parsed =
    typeof responseBody === "string"
      ? JSON.parse(responseBody || "{}")
      : responseBody || {};

  return {
    type: parsed.type || parsed.event || "",
    payload: parsed.payload || parsed,
  };
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

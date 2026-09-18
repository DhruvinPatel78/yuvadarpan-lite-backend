const jwt = require("jsonwebtoken");
const { findAccountByTokenId } = require("./managerScope");

const WRITE_METHODS = ["POST", "DELETE", "PATCH", "PUT"];

const verifyToken = (options = {}) => {
  const methods = options.methods;
  return async (req, res, next) => {
    if (methods && !methods.includes(req.method)) {
      return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      req.error = { message: "no-token" };
      return next();
    }
    try {
      const decoded = jwt.verify(
        String(authHeader).replace(/^Bearer\s+/i, "").trim(),
        process.env.JWT_SECRET,
      );
      const account = await findAccountByTokenId(decoded.id);
      if (!account || account.allowed === false || account.active === false) {
        req.error = { message: "TokenExpiredError" };
        return next();
      }
      req.user = {
        email: account.email,
        role: account.role,
        id: String(account._id || account.id),
      };
    } catch (error) {
      req.error = { message: error.name };
    }
    next();
  };
};

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message:
        message === "no-token"
          ? "Please sign in."
          : "Session expired. Sign in again.",
    });
    return true;
  }
  return false;
};

const requireAuth = (req, res, next) => {
  if (errorCheck(req, res)) {
    return;
  }
  next();
};

module.exports = { verifyToken, errorCheck, requireAuth, WRITE_METHODS };

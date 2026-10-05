/**
 * PhonePe SDK uses class-transformer plainToClass (0.4.x API).
 * Newer class-transformer versions renamed it to plainToInstance.
 */
const ensurePlainToClass = () => {
  try {
    const mod = require("class-transformer");
    const ct = mod?.default && typeof mod.default === "object" ? mod.default : mod;

    const bindAlias = (legacyName, modernName) => {
      if (typeof ct[legacyName] !== "function" && typeof ct[modernName] === "function") {
        ct[legacyName] = (...args) => ct[modernName](...args);
      }
      if (mod !== ct && typeof mod[legacyName] !== "function" && typeof ct[legacyName] === "function") {
        mod[legacyName] = ct[legacyName];
      }
    };

    bindAlias("plainToClass", "plainToInstance");
    bindAlias("plainToClassFromExist", "plainToInstanceFromExist");
    bindAlias("classToPlain", "instanceToPlain");
    bindAlias("classToPlainFromExist", "instanceToPlainFromExist");
  } catch (error) {
    console.error("class-transformer-compat-failed", error.message);
  }
};

module.exports = { ensurePlainToClass };

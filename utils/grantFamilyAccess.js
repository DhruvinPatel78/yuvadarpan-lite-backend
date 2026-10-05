const crypto = require("crypto");
const FamilyId = require("../models/familyId");
const Payment = require("../models/payment");
const { escapeRegex } = require("./escapeRegex");
const { recordActivity } = require("./activityLog");

const normalizeFamilyId = (value) => String(value ?? "").trim();

const findFamilyIdDoc = async (familyId, { includeInactive = false } = {}) => {
  const value = normalizeFamilyId(familyId);
  if (!value) return null;
  const numericFamilyId = Number(value);
  const filters = [
    {
      $or: [
        { familyId: value },
        {
          familyId: {
            $regex: new RegExp(`^${escapeRegex(value)}$`, "i"),
          },
        },
        ...(Number.isFinite(numericFamilyId)
          ? [{ familyId: String(numericFamilyId) }]
          : []),
      ],
    },
  ];
  if (!includeInactive) {
    filters.push({ active: { $ne: false } });
  }
  return FamilyId.findOne({ $and: filters });
};

const ensureFamilyIdAccess = async ({ familyId, userId, req = null }) => {
  const value = normalizeFamilyId(familyId);
  if (!value) {
    return { created: false, familyId: "", doc: null };
  }

  const existing = await findFamilyIdDoc(value, { includeInactive: true });
  if (existing) {
    if (existing.active === false) {
      existing.active = true;
      existing.updatedAt = new Date();
      existing.updatedBy = userId || existing.updatedBy || null;
      await existing.save();
    }
    return { created: false, familyId: value, doc: existing };
  }

  const doc = await FamilyId.create({
    id: crypto.randomUUID().replace(/-/g, ""),
    familyId: value,
    active: true,
    createdAt: new Date(),
    updatedAt: null,
    createdBy: userId || null,
    updatedBy: null,
  });

  if (req) {
    await recordActivity({
      req,
      action: "create",
      entityType: "familyId",
      entity: doc,
      next: doc,
    }).catch(() => {});
  }

  return { created: true, familyId: value, doc };
};

const markPaymentCompleted = async (payment, extras = {}) => {
  if (!payment) return null;
  if (payment.status === "COMPLETED") {
    return payment;
  }
  payment.status = "COMPLETED";
  payment.paidAt = payment.paidAt || new Date();
  payment.updatedAt = new Date();
  if (extras.phonepeOrderId) {
    payment.phonepeOrderId = extras.phonepeOrderId;
  }
  if (extras.errorCode != null) {
    payment.errorCode = extras.errorCode;
  }
  await payment.save();
  return payment;
};

const completeAccessPayment = async ({
  payment,
  phonepeOrderId = "",
  req = null,
  userSnapshot = null,
}) => {
  if (!payment) {
    return { payment: null, granted: false };
  }

  let snapshotChanged = false;
  if (userSnapshot) {
    if (userSnapshot.userName && payment.userName !== userSnapshot.userName) {
      payment.userName = userSnapshot.userName;
      snapshotChanged = true;
    }
    if (userSnapshot.userEmail && payment.userEmail !== userSnapshot.userEmail) {
      payment.userEmail = userSnapshot.userEmail;
      snapshotChanged = true;
    }
    if (
      userSnapshot.userMobile &&
      payment.userMobile !== userSnapshot.userMobile
    ) {
      payment.userMobile = userSnapshot.userMobile;
      snapshotChanged = true;
    }
  }

  const grant = await ensureFamilyIdAccess({
    familyId: payment.familyId,
    userId: payment.userId,
    req,
  });

  const updated = await markPaymentCompleted(payment, { phonepeOrderId });
  if (snapshotChanged && updated?.status === "COMPLETED") {
    updated.updatedAt = new Date();
    await updated.save();
  }
  return {
    payment: updated,
    granted: true,
    familyIdCreated: grant.created,
    familyId: grant.familyId,
  };
};

module.exports = {
  normalizeFamilyId,
  findFamilyIdDoc,
  ensureFamilyIdAccess,
  completeAccessPayment,
};

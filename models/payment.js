const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    merchantOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    phonepeOrderId: {
      type: String,
      default: "",
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    amountInr: {
      type: Number,
      required: true,
    },
    amountPaisa: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["CREATED", "PENDING", "COMPLETED", "FAILED"],
      default: "CREATED",
      index: true,
    },
    redirectUrl: String,
    message: String,
    errorCode: String,
    paidAt: Date,
    createdAt: Date,
    updatedAt: Date,
  },
  {
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

paymentSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);

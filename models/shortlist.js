const mongoose = require("mongoose");

const shortlistSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    yuvaId: {
      type: String,
      required: true,
    },
    createdAt: Date,
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  },
);

shortlistSchema.index({ userId: 1, yuvaId: 1 }, { unique: true });

const Shortlist = mongoose.model("Shortlist", shortlistSchema);

module.exports = Shortlist;

const mongoose = require("mongoose");

const surNameSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  gotra: {
    type: String,
    required: true,
  },
  mainBranch: {
    type: String,
    required: true,
  },
  active: Boolean,
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  updatedBy: String,
}, {
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            return ret;
        }
    }
});

const Surname = mongoose.model("Surname", surNameSchema);

module.exports = Surname;

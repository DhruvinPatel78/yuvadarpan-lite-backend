const mongoose = require("mongoose");
const { getRoleRank, normalizeRole } = require("../utils/userVisibility");

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  middleName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
  },
  familyId: {
    type: Number,
    required: true,
  },
  dob: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  vibhag: String,
  localSamaj: {
    type: String,
    required: true,
  },
  city: String,
  district: String,
  state: String,
  country: String,
  language: {
    type: String,
    default: "gu",
  },
  active: Boolean,
  allowed: Boolean,
  role: String,
  roleRank: {
    type: Number,
    index: true,
  },
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,
  gender: String,
  updatedBy: String,
  fcmToken: { type: String },
}, {
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.password;
            return ret;
        }
    },
    toObject: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.password;
            return ret;
        }
    }
});

userSchema.pre("save", function syncRoleRank(next) {
  if (this.role) {
    this.role = normalizeRole(this.role);
  }
  this.roleRank = getRoleRank(this.role);
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;

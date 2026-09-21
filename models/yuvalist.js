const mongoose = require("mongoose");
const { asName } = require("../utils/masterName");

const langPair = { type: mongoose.Schema.Types.Mixed, default: () => ({ en: "", gu: "" }) };
const langPairRequired = { type: mongoose.Schema.Types.Mixed, required: true };

const hasEn = (value) => {
  const pair = asName(value);
  return Boolean(String(pair.en || "").trim());
};

const mamaInfoSchema = new mongoose.Schema({
  name: langPair,
  lastName: String,
  city: langPair,
  native: String,
});
const educationSchema = new mongoose.Schema({
  education: String,
  fieldOfStudy: String,
});
const contactInfoSchema = new mongoose.Schema({
  name: langPair,
  lastName: String,
  phone: Number,
  relation: String,
});
const profileSchema = new mongoose.Schema({
  url: String,
  name: String,
  awsId: String,
});
const otherPairSchema = {
  type: mongoose.Schema.Types.Mixed,
  default: () => ({ en: {}, gu: {} }),
};
const yuvaListSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  familyId: {
    type: String,
    required: true,
  },
  native: {
    type: String,
    required: true,
  },
  firstName: {
    ...langPairRequired,
    validate: {
      validator: hasEn,
      message: "First name is required",
    },
  },
  fatherName: langPair,
  lastName: {
    type: String,
    required: true,
  },
  dob: {
    type: Date,
    required: true,
  },
  motherName: {
    ...langPairRequired,
    validate: {
      validator: hasEn,
      message: "Mother name is required",
    },
  },
  firm: {
    ...langPairRequired,
    validate: {
      validator: hasEn,
      message: "Firm is required",
    },
  },
  firmAddress: {
    ...langPairRequired,
    validate: {
      validator: hasEn,
      message: "Firm address is required",
    },
  },
  address: {
    ...langPairRequired,
    validate: {
      validator: hasEn,
      message: "Address is required",
    },
  },
  country: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  mamaInfo: mamaInfoSchema,
  contactInfo: contactInfoSchema,
  education: educationSchema,
  bloodGroup: {
    type: String,
  },
  height: {
    type: String,
    required: true,
  },
  gender: langPair,
  pob: langPair,
  activity: langPair,
  martialStatus: langPair,
  grandFatherName: langPair,
  YSKno: String,
  abroadStudy: String,
  weight: {
    type: String,
    required: true,
  },
  profile: profileSchema,
  handicap: Boolean,
  manglik: { type: Boolean, default: false },
  region: String,
  district: String,
  localSamaj: String,
  handicapDetails: langPair,
  other: otherPairSchema,
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
            delete ret.email;
            delete ret.gu;
            return ret;
        }
    },
    toObject: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.email;
            delete ret.gu;
            return ret;
        }
    }
});

const TEXT_KEYS = [
  "firstName",
  "fatherName",
  "grandFatherName",
  "motherName",
  "pob",
  "firm",
  "firmAddress",
  "address",
  "handicapDetails",
  "gender",
  "martialStatus",
  "activity",
];

yuvaListSchema.pre("validate", function () {
  TEXT_KEYS.forEach((key) => {
    this[key] = asName(this[key], this[`${key}En`], this[`${key}Gu`]);
    this[`${key}En`] = undefined;
    this[`${key}Gu`] = undefined;
  });
  if (this.mamaInfo) {
    this.mamaInfo.name = asName(this.mamaInfo.name, this.mamaInfo.nameEn, this.mamaInfo.nameGu);
    this.mamaInfo.city = asName(this.mamaInfo.city, this.mamaInfo.cityEn, this.mamaInfo.cityGu);
    this.mamaInfo.nameEn = undefined;
    this.mamaInfo.nameGu = undefined;
    this.mamaInfo.cityEn = undefined;
    this.mamaInfo.cityGu = undefined;
  }
  if (this.contactInfo) {
    this.contactInfo.name = asName(
      this.contactInfo.name,
      this.contactInfo.nameEn,
      this.contactInfo.nameGu
    );
    this.contactInfo.nameEn = undefined;
    this.contactInfo.nameGu = undefined;
    if (this.contactInfo.phone != null && this.contactInfo.phone !== "") {
      const digits = String(this.contactInfo.phone).replace(/\D/g, "");
      this.contactInfo.phone = digits ? Number(digits) : undefined;
    }
  }
  if (this.other && typeof this.other === "object" && !Array.isArray(this.other)) {
    const enIsMap = this.other.en && typeof this.other.en === "object";
    const guIsMap = this.other.gu && typeof this.other.gu === "object";
    if (!enIsMap && !guIsMap && !("en" in this.other) && !("gu" in this.other)) {
      this.other = { en: this.other, gu: this.otherGu || {} };
    }
  }
  this.otherEn = undefined;
  this.otherGu = undefined;
});

const Yuvalist = mongoose.model("YuvaList", yuvaListSchema);

module.exports = Yuvalist;

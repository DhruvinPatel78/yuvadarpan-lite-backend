const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuvalist = require("../models/yuvalist");
const User = require("../models/user");
const Region = require("../models/region");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    jwt.verify(
      authHeader.replace("Bearer ", ""),
      process.env.JWT_SECRET,
      (error, res) => {
        if (res) {
          req.user = {
            email: res.email,
            role: res.role,
            id: res.id,
          };
        } else {
          req.error = {
            message: error.name,
          };
        }
      },
    );
  } else {
    req.error = {
      message: "no-token",
    };
  }
  next();
};

router.use(verifyToken);

const errorCheck = (req, res) => {
  if (req.hasOwnProperty("error")) {
    const { message } = req.error;
    res.status(401).send({
      message: message === "no-token" ? "unauthenticated" : "token-expired",
    });
    return true;
  } else {
    return false;
  }
};

router.get("/list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id, role } = req.user;
    const {
      lastName = [],
      native = [],
      familyId,
      gender,
      firmName,
    } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const FirstName =
      lastName?.length > 0
        ? {
            lastName: { $in: lastName },
          }
        : {};
    const NativeName =
      native?.length > 0
        ? {
            native: { $in: native },
          }
        : {};
    const FamilyId = familyId
      ? {
          familyId: { $eq: familyId },
        }
      : {};
    const Gender = gender
      ? {
          gender: { $eq: gender },
        }
      : {};
    const Firm = firmName
      ? {
          firm: { $eq: firmName },
        }
      : {};
    if (role === "ADMIN") {
      const yuvas = await Yuvalist.find({
        ...NativeName,
        ...FirstName,
        ...FamilyId,
        ...Gender,
        ...Firm,
      })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await Yuvalist.countDocuments({
        ...NativeName,
        ...FirstName,
        ...FamilyId,
        ...Gender,
        ...Firm,
      });
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: yuvas });
    } else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const MangerYuvas = await Yuvalist.find({
          region: { $eq: mangerRegion?.region },
          ...NativeName,
          ...FirstName,
          ...FamilyId,
          ...Gender,
          ...Firm,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          region: { $eq: mangerRegion?.region },
          ...NativeName,
          ...FirstName,
          ...FamilyId,
          ...Gender,
          ...Firm,
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerYuvas,
        });
      }
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const MangerYuvas = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...NativeName,
          ...FirstName,
          ...FamilyId,
          ...Gender,
          ...Firm,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...NativeName,
          ...FirstName,
          ...FamilyId,
          ...Gender,
          ...Firm,
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerYuvas,
        });
      }
    }
  }
});

router.get("/list/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    const dbYuva = await Yuvalist.findById(req.params.id);
    res.json(dbYuva);
  }
});

router.get("/citylist", async (req, res) => {
  if (!errorCheck(req, res)) {
    const data = require("../data/pages.json");
    res.json(data.data);
  }
});

router.post("/addYuvaList", async (req, res) => {
  const data = req.body;
  const user = req.user;
  if (user.role === "ADMIN") {
    const dbYuvaList = await Yuvalist.create({
      ...data,
      id: crypto.randomUUID().replace(/-/g, ""),
      active: true,
      createdAt: new Date(),
      updatedAt: null,
      createdBy: req.user.id,
      updatedBy: null,
    });
    res.send(dbYuvaList);
  } else {
    res.status(403).send({ message: "only-admin-can-create-yuva" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await Yuvalist.deleteOne({ id: { $in: req.params.id } });
    res.status(200).json({ message: "Delete Successfully" });
  }
});

router.patch("/update/:id", async (req, res) => {
  if (!errorCheck(req, res)) {
    await Yuvalist.updateOne({ id: req.body.id }, { ...req.body });
    res.status(200).json({ message: "Updated Successfully" });
  }
});

router.get("/requests", async (req, res) => {
  if (!errorCheck(req, res)) {
    const { id, role } = req.user;
    const {
      lastName = [],
      state = [],
      region = [],
      samaj = [],
      familyId,
      firstName,
      mobile,
      email,
      gender,
      roles = [],
    } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const Roles =
      roles?.length > 0
        ? {
            role: { $in: roles },
          }
        : {};
    const LastName =
      lastName?.length > 0
        ? {
            lastName: { $in: lastName },
          }
        : {};
    const FamilyId = familyId
      ? {
          familyId: { $eq: familyId },
        }
      : {};
    const FirstName = firstName
      ? {
          firstName: { $in: firstName },
        }
      : {};
    const Mobile = mobile
      ? {
          mobile: { $eq: mobile },
        }
      : {};
    const Email = email
      ? {
          email: { $eq: email },
        }
      : {};
    const Gender = gender
      ? {
          gender: { $eq: gender },
        }
      : {};

    const RegionData = await Region.findOne({
      state_id: { $in: state },
    });
    const State = RegionData
      ? {
          region: { $eq: RegionData?.id },
        }
      : {};
    const CurrentRegion =
      region?.length > 0
        ? {
            region: { $in: region },
          }
        : {};
    const CurrentSamaj =
      samaj?.length > 0
        ? {
            localSamaj: { $in: samaj },
          }
        : {};
    if (role === "ADMIN") {
      const users = await Yuvalist.find({
        allowed: { $eq: false },
        active: true,
        ...LastName,
        ...State,
        ...CurrentRegion,
        ...CurrentSamaj,
        ...FamilyId,
        ...FirstName,
        ...Mobile,
        ...Gender,
        ...Email,
        ...Roles,
      })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await Yuvalist.find({
        allowed: { $eq: false },
        active: true,
        ...LastName,
        ...State,
        ...CurrentRegion,
        ...CurrentSamaj,
        ...FamilyId,
        ...FirstName,
        ...Mobile,
        ...Gender,
        ...Email,
        ...Roles,
      }).countDocuments({});
      const totalPages = Math.ceil(totalItems / limit);
      res
        .status(200)
        .json({ total: totalItems, page, totalPages, data: users });
    } else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const MangerUsers = await Yuvalist.find({
          allowed: { $eq: false },
          active: true,
          region: { $eq: mangerRegion?.region },
          ...LastName,
          ...State,
          ...CurrentRegion,
          ...CurrentSamaj,
          ...FamilyId,
          ...FirstName,
          ...Mobile,
          ...Gender,
          ...Email,
          ...Roles,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          allowed: { $eq: false },
          active: true,
          region: { $eq: mangerRegion?.region },
          ...LastName,
          ...State,
          ...CurrentRegion,
          ...CurrentSamaj,
          ...FamilyId,
          ...FirstName,
          ...Mobile,
          ...Gender,
          ...Email,
          ...Roles,
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const MangerUsers = await Yuvalist.find({
          allowed: { $eq: false },
          active: true,
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...LastName,
          ...State,
          ...CurrentRegion,
          ...CurrentSamaj,
          ...FamilyId,
          ...FirstName,
          ...Mobile,
          ...Gender,
          ...Email,
          ...Roles,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          allowed: { $eq: false },
          active: true,
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...LastName,
          ...State,
          ...CurrentRegion,
          ...CurrentSamaj,
          ...FamilyId,
          ...FirstName,
          ...Mobile,
          ...Gender,
          ...Email,
          ...Roles,
        }).countDocuments({});
        const totalPages = Math.ceil(managerTotalItem / limit);
        res.status(200).json({
          total: managerTotalItem,
          page,
          totalPages,
          data: MangerUsers,
        });
      }
    }
  }
});

module.exports = router;

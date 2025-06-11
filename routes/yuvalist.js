const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Yuvalist = require("../models/yuvalist");
const User = require("../models/user");
const Region = require("../models/region");
const Surname = require("../models/surname");

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
    const LastName =
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
    const filterSearch = {
      ...LastName,
      ...NativeName,
      ...FamilyId,
      ...Gender,
      ...Firm,
    };
    if (role === "ADMIN") {
      const yuvas = await Yuvalist.find({
        ...filterSearch,
      })
        .skip(offset)
        .limit(limit)
        .exec();
      const totalItems = await Yuvalist.countDocuments({
        ...filterSearch,
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
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          region: { $eq: mangerRegion?.region },
          ...filterSearch,
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
          ...filterSearch,
        })
          .skip(offset)
          .limit(limit)
          .exec();
        const managerTotalItem = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
          ...filterSearch,
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

router.get("/get-all-list", async (req, res) => {
  if (!errorCheck(req, res)) {
    const {id, role} = req.user;
    if (role === "ADMIN") {
      const dbYuva = await Yuvalist.find();
      res.status(200).json(dbYuva);
    }else if (role === "REGION_MANAGER") {
      const mangerRegion = await User.findById(id);
      if (mangerRegion?.region) {
        const dbYuva = await Yuvalist.find({
          region: { $eq: mangerRegion?.region },
        });
        res.status(200).json(dbYuva);
      }
    } else if (role === "SAMAJ_MANAGER") {
      const mangerSamaj = await User.findById(id);
      if (mangerSamaj?.localSamaj) {
        const dbYuva = await Yuvalist.find({
          localSamaj: { $eq: mangerSamaj?.localSamaj },
        });
        res.status(200).json(dbYuva);
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

module.exports = router;

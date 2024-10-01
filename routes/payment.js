const express = require("express");
const router = express.Router();

router.post("/status", async (req, res) => {
    console.log(req)
    res.status(200).send({ message: "Success" });;
});

module.exports = router;

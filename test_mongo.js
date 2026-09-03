const mongoose = require("mongoose");
const env = require("dotenv").config({path: "../yuvadarpan-lite-backend/.env"});
mongoose.connect("mongodb://127.0.0.1:27017/yuvadarpan", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const Yuva = mongoose.model("YuvaList", new mongoose.Schema({}, { strict: false }));
    const yuvas = await Yuva.find().limit(5);
    console.log("Yuva fields available:", yuvas.length > 0 ? Object.keys(yuvas[0].toObject()) : "None");
    if(yuvas.length > 0) {
       console.log("Yuva 1 Sample Native:", yuvas[0].native);
       console.log("Yuva 1 Sample State:", yuvas[0].state);
       console.log("Yuva 1 Sample Region:", yuvas[0].region);
       console.log("Yuva 1 Sample Samaj:", yuvas[0].localSamaj);
    }
    process.exit(0);
  })
  .catch(err => console.log(err));

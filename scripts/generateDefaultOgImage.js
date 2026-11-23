const path = require("path");
const { renderDefaultOgJpeg } = require("../utils/yuvaOgImage");
const sharp = require("sharp");

const outPng = path.join(
  __dirname,
  "../../yuvadarpan-lite-web-app/public/default-og-user.png"
);
const outJpg = path.join(
  __dirname,
  "../../yuvadarpan-lite-web-app/public/default-og-user.jpg"
);

renderDefaultOgJpeg("Community Directory")
  .then(async (jpeg) => {
    await sharp(jpeg).png().toFile(outPng);
    await sharp(jpeg).jpeg({ quality: 84 }).toFile(outJpg);
    console.log("wrote", outPng);
    console.log("wrote", outJpg);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

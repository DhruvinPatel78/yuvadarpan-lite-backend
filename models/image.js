const mongoose = require("mongoose");
const ImageSchema = new mongoose.Schema(
  {
    url: String,
    name: String,
    awsId: String,
  },
  {
    collection: "Images",
  }
);
const Image = mongoose.model("Images", ImageSchema);
module.exports = Image;

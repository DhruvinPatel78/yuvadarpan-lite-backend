const mongoose = require("mongoose");

const districtSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    country_id: {
        type: String,
        required: true,
    },
    state_id: {
        type: String,
        required: true,
    },
    region_id: {
        type: String,
        required: true,
    },
    active: Boolean,
    createdAt:Date,
    updatedAt:Date,
    createdBy:String,
    updatedBy:String,
});

const District = mongoose.model("District", districtSchema);

module.exports = District;

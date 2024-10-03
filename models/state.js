const mongoose = require("mongoose");

const stateSchema = new mongoose.Schema({
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
    active: Boolean,
    createdAt:Date,
    updatedAt:Date,
    createdBy:String,
    updatedBy:String,
});

const State = mongoose.model("State", stateSchema);

module.exports = State;

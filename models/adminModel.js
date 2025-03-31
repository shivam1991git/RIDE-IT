const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
    fullName: {type: String, required: true},
    username: {type: String, required: true},
    phoneNumber: {type: Number, required: true},
    email: {type: String, required: true},
    pincode: {type: Number, required: true},
    state: {type: String, required: true},
    address: {type: String, required: true},
    gender: {type: String, required: true},
    password: {type: String, required: true}
})

const adminModel = mongoose.model('admin', adminSchema)
module.exports = adminModel
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    fullName: {type: String, required: true},
    username: {type: String, required: true},
    phoneNumber: {type: Number, required: true},
    email: {type: String, required: true},
    pincode: {type: Number, required: true},
    state: {type: String, required: true},
    address: {type: String, required: true},
    password: {type: String, required: true}
})

const userModel = mongoose.model('user', userSchema)
module.exports = userModel
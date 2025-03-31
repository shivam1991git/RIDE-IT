const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
    fullName: {type: String, required: true},
    username: {type: String, required: true},
    phoneNumber: {type: Number, required: true},
    email: {type: String, required: true},
    pincode: {type: Number, required: true},
    state: {type: String, required: true},
    address: {type: String, required: true},
    password: {type: String, required: true},
    drivingLicenseNumber: {type: String, required: true},
    dob: {type: String, required: true},
    gender: {type: String, required: true}
})

const driverModel = mongoose.model('driver', driverSchema)
module.exports = driverModel
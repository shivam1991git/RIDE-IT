const express = require("express");
const router = express.Router();

const Driver = require("../models/driverModel")
const auth = require("../middleware/authMiddleware")
const { hashPassword, toSafeAuthPayload, verifyPasswordAndUpgrade } = require("../utils/authUtils")

router.post("/driverlogin", async(req, res)=>{

    const { username, password} = req.body

    try {
        const driver = await Driver.findOne({ username })
        const isValid = await verifyPasswordAndUpgrade(driver, password)

        if(isValid){
            res.send(toSafeAuthPayload(driver, 'driver'))
        }
        else{
            return res.status(400).json({ message: 'Invalid username or password' })
        }
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/driverregister", async(req, res)=>{
    const { email, username } = req.body;

    try {
      // Check if user already exists
      let driver = await Driver.findOne({ $or: [{ email }, { username }] });
      if (driver) {
        return res.status(400).json({ msg: 'Driver already exists' });
  
      }
    else {
       const newdriver = new Driver({
            ...req.body,
            password: await hashPassword(req.body.password)
       })
        await newdriver.save()
        res.send('Driver registerd successfully')
    } }
    catch (error) {
        return res.status(400).json(error)
    }
});

router.get("/getalldrivers", auth(['admin']), async (req, res) => {
    try {
        const drivers = await Driver.find().select('-password')
        res.send(drivers)
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/adddriver', auth(['admin']), async (req, res) => {
    try {
        const newdriver = new Driver({
            ...req.body,
            password: await hashPassword(req.body.password)
        })
        await newdriver.save()
        res.send("Driver added Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post('/editdriver', auth(['admin']), async (req, res) => {
    try {
        const driver = await Driver.findOne({ _id: req.body._id })
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' })
        }
        driver.fullName = req.body.fullName
        driver.username = req.body.username
        driver.phoneNumber = req.body.phoneNumber
        driver.email = req.body.email
        driver.pincode = req.body.pincode
        driver.state = req.body.state
        driver.address = req.body.address
        driver.drivingLicenseNumber = req.body.drivingLicenseNumber
        driver.dob = req.body.dob
        driver.gender = req.body.gender
        if (req.body.password) {
            driver.password = await hashPassword(req.body.password)
        }


        await driver.save()

        res.send("Driver Edited Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post('/deletedriver', auth(['admin']), async (req, res) => {
    try {
        await Driver.findOneAndDelete({ _id: req.body.driverid });

        res.send("Driver deleted Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

module.exports = router

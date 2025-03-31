const express = require("express");
const router = express.Router();

const Driver = require("../models/driverModel")

router.post("/driverlogin", async(req, res)=>{

    const { username, password} = req.body

    try {
        const driver = await Driver.findOne({username, password})
        if(driver){
            res.send(driver)
        }
        else{
            return res.status(400).json(error)
        }
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/driverregister", async(req, res)=>{
    const { email} = req.body;

    try {
      // Check if user already exists
      let driver = await Driver.findOne({ email });
      if (driver) {
        return res.status(400).json({ msg: 'Driver already exists' });
  
      }
    else {
       const newdriver = new Driver(req.body)
        await newdriver.save()
        res.send('Driver registerd successfully')
    } }
    catch (error) {
        return res.status(400).json(error)
    }
});

router.get("/getalldrivers", async (req, res) => {
    try {
        const drivers = await Driver.find()
        res.send(drivers)
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/adddriver', async (req, res) => {
    try {
        const newdriver = new Driver(req.body)
        await newdriver.save()
        res.send("Driver added Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post('/editdriver', async (req, res) => {
    try {
        const driver = await Driver.findOne({ _id: req.body._id })
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
        driver.password = req.body.password


        await driver.save()

        res.send("Driver Edited Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post('/deletedriver', async (req, res) => {
    try {
        await Driver.findOneAndDelete({ _id: req.body.driverid });

        res.send("Driver deleted Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/feedback", async(req, res)=>{

    try {
       const newfeedback = new Driver(req.body)
        await newfeedback.save()
        res.send('Feedback Submitted')
    } catch (error) {
        return res.status(400).json(error)
    }
});

module.exports = router
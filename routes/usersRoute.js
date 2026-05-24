const express = require("express");
const router = express.Router();

const User = require("../models/userModel")
const auth = require("../middleware/authMiddleware")
const { hashPassword, toSafeAuthPayload, verifyPasswordAndUpgrade } = require("../utils/authUtils")

router.post("/login", async(req, res)=>{

    const { username, password} = req.body

    try {
        const user = await User.findOne({ username })
        const isValid = await verifyPasswordAndUpgrade(user, password)

        if(isValid){
            res.send(toSafeAuthPayload(user, 'user'))
        }
        else{
            return res.status(400).json({ message: 'Invalid username or password' })
        }
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/register", async(req, res)=>{
    const { email, username } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ $or: [{ email }, { username }] });
      if (user) {
        return res.status(400).json({ msg: 'User already exists' });
      }
    else {

       const newuser = new User({
            ...req.body,
            password: await hashPassword(req.body.password)
       })
        await newuser.save()
        res.send('user registerd successfully')
    } }
    catch (error) {
        return res.status(400).json(error)
    }
});

router.get("/getallusers", auth(['admin']), async (req, res) => {
    try {
        const users = await User.find().select('-password')
        res.send(users)
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/adduser', auth(['admin']), async (req, res) => {
    try {
        const newuser = new User({
            ...req.body,
            password: await hashPassword(req.body.password)
        })
        await newuser.save()
        res.send("User added Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post('/edituser', auth(['admin']), async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.body._id })
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        user.fullName = req.body.fullName
        user.username = req.body.username
        user.phoneNumber = req.body.phoneNumber
        user.email = req.body.email
        user.pincode = req.body.pincode
        user.state = req.body.state
        user.address = req.body.address
        if (req.body.password) {
            user.password = await hashPassword(req.body.password)
        }


        await user.save()

        res.send("User Edited Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post('/deleteuser', auth(['admin']), async (req, res) => {
    try {
        await User.findOneAndDelete({ _id: req.body.userid });

        res.send("User deleted Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


module.exports = router;

const express = require("express");
const router = express.Router();

const User = require("../models/userModel")

router.post("/login", async(req, res)=>{

    const { username, password} = req.body

    try {
        const user = await User.findOne({username, password})
        // console.log(user)
        if(user){
            res.send(user)
        }
        else{
            return res.status(400).json(error)
        }
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/register", async(req, res)=>{
    const { email} = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ msg: 'User already exists' });
      }
    else {

       const newuser = new User(req.body)
        await newuser.save()
        res.send('user registerd successfully')
    } }
    catch (error) {
        return res.status(400).json(error)
    }
});

router.get("/getallusers", async (req, res) => {
    try {
        const users = await User.find()
        res.send(users)
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/adduser', async (req, res) => {
    try {
        const newuser = new User(req.body)
        await newuser.save()
        res.send("User added Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post('/edituser', async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.body._id })
        user.fullName = req.body.fullName
        user.username = req.body.username
        user.phoneNumber = req.body.phoneNumber
        user.email = req.body.email
        user.pincode = req.body.pincode
        user.state = req.body.state
        user.address = req.body.address
        user.password = req.body.password


        await user.save()

        res.send("User Edited Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post('/deleteuser', async (req, res) => {
    try {
        await User.findOneAndDelete({ _id: req.body.userid });

        res.send("User deleted Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post("/feedback", async(req, res)=>{

    try {
       const newfeedback = new User(req.body)
        await newfeedback.save()
        res.send('Feedback Submitted')
    } catch (error) {
        return res.status(400).json(error)
    }
});

module.exports = router;

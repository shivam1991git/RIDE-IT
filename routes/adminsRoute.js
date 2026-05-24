const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken")

const Admin = require("../models/adminModel")
const { hashPassword, toSafeAuthPayload, verifyPasswordAndUpgrade } = require("../utils/authUtils")

async function requireAdminWhenAdminsExist(req, res, next) {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
        return next();
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Admin authentication required" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can create another admin" });
        }
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

router.post("/adminlogin", async(req, res)=>{

    const { username, password} = req.body

    try {
        const admin = await Admin.findOne({ username })
        const isValid = await verifyPasswordAndUpgrade(admin, password)

        if(isValid){
            res.send(toSafeAuthPayload(admin, 'admin'))
        }
        else{
            return res.status(400).json({ message: 'Invalid username or password' })
        }
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post("/adminregister", requireAdminWhenAdminsExist, async(req, res)=>{

    try {
       const existingAdmin = await Admin.findOne({ $or: [{ email: req.body.email }, { username: req.body.username }] })
       if (existingAdmin) {
            return res.status(400).json({ message: 'Admin already exists' })
       }

       const newadmin = new Admin({
            ...req.body,
            password: await hashPassword(req.body.password)
       })
        await newadmin.save()
        res.send('Admin registerd successfully')
    } catch (error) {
        return res.status(400).json(error)
    }
});

module.exports = router

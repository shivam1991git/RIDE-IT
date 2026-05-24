const express = require("express");
const router = express.Router();

const Car = require("../models/carModel")
const auth = require("../middleware/authMiddleware")

router.get("/getallcars", async (req, res) => {
    try {
        const cars = await Car.find()
        res.send(cars)
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/addcar', auth(['admin']), async (req, res) => {
    try {
        const newcar = new Car(req.body)
        await newcar.save()
        res.send("Car added Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

router.post('/editcar', auth(['admin']), async (req, res) => {
    try {
        const car = await Car.findOne({ _id: req.body._id })
        if (!car) {
            return res.status(404).json({ message: "Car not found" })
        }
        car.name = req.body.name
        car.image = req.body.image
        car.fuelType = req.body.fuelType
        car.capacity = req.body.capacity
        car.rentPerHour = req.body.rentPerHour

        await car.save()

        res.send("Car Edited Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});


router.post('/deletecar', auth(['admin']), async (req, res) => {
    try {
        await Car.findOneAndDelete({ _id: req.body.carid });

        res.send("Car deleted Successfully")
    } catch (error) {
        return res.status(400).json(error)
    }
});

module.exports = router;

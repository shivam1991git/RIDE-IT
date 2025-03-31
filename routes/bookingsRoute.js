const express = require("express");
const router = express.Router();
const Booking = require("../models/bookingModel");
const Car = require("../models/carModel");
const moment = require('moment');
const stripe = require('stripe')('Enter stripe Key');

router.post("/bookcar", async (req, res) => {
    const { car, bookedTimeSlot } = req.body;

    try {
        const existingBookings = await Booking.find({ car, status: 'Pending' });

        let isAvailable = true;
        existingBookings.forEach(booking => {
            if (
                moment(bookedTimeSlot.from).isBetween(booking.bookedTimeSlot.from, booking.bookedTimeSlot.to) ||
                moment(bookedTimeSlot.to).isBetween(booking.bookedTimeSlot.from, booking.bookedTimeSlot.to) ||
                moment(booking.bookedTimeSlot.from).isBetween(bookedTimeSlot.from, bookedTimeSlot.to) ||
                moment(booking.bookedTimeSlot.to).isBetween(bookedTimeSlot.from, bookedTimeSlot.to)
            ) {
                isAvailable = false;
            }
        });

        if (!isAvailable) {
            return res.status(400).json({ message: 'Car is already booked at the selected time slot' });
        }

        req.body.transactionId = '1234';
        const newBooking = new Booking({
            ...req.body,
            status: 'Pending'
        });
        await newBooking.save();

        const carToUpdate = await Car.findOne({ _id: car });
        carToUpdate.bookedTimeSlot.push(bookedTimeSlot);
        await carToUpdate.save();

        res.send('Your booking is successful!');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request' });
    }
});

router.get("/getallbookings", async (req, res) => {
    try {
        const bookings = await Booking.find().populate('car');
        res.send(bookings);
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/checkAvailability', async (req, res) => {
    const { carId, from, to } = req.body;
    try {
        const bookings = await Booking.find({ car: carId, status: 'Pending' });

        let isAvailable = true;
        bookings.forEach(booking => {
            if (
                moment(from).isBetween(booking.bookedTimeSlot.from, booking.bookedTimeSlot.to) ||
                moment(to).isBetween(booking.bookedTimeSlot.from, booking.bookedTimeSlot.to) ||
                moment(booking.bookedTimeSlot.from).isBetween(from, to) ||
                moment(booking.bookedTimeSlot.to).isBetween(from, to)
            ) {
                isAvailable = false;
            }
        });

        res.send({ isAvailable });
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/cancelBooking', async (req, res) => {
    const { bookingId } = req.body;
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        booking.status = 'Cancelled';
        await booking.save();
        res.send('Booking cancelled successfully');
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/updateStatus', async (req, res) => {
    const { bookingId, status } = req.body;
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        booking.status = status;
        await booking.save();
        res.send('Booking status updated successfully');
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/confirmDriver', async (req, res) => {
    const { bookingId, driverId } = req.body;
    try {
      const booking = await Booking.findById(bookingId).populate('user').populate('car');
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }
      if (booking.driverConfirmed) {
        return res.status(400).json({ message: 'Booking already confirmed by another driver' });
      }
      booking.driver = driverId;
      booking.driverConfirmed = true;
      booking.status = 'Confirmed';
      await booking.save();
      res.send('Booking confirmed by driver successfully');
    } catch (error) {
      return res.status(400).json({ error: 'An error occurred while confirming the booking' });
    }
  });

module.exports = router;


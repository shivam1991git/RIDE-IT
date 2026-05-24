const express = require("express");
const router = express.Router();
const Booking = require("../models/bookingModel");
const Car = require("../models/carModel");
const moment = require('moment');
const { randomUUID } = require('crypto');
const auth = require("../middleware/authMiddleware");

const activeStatuses = ['Pending', 'Confirmed', 'Driver Confirmation Pending'];

function isOverlapping(firstSlot, secondSlot) {
    const firstStart = moment(firstSlot.from);
    const firstEnd = moment(firstSlot.to);
    const secondStart = moment(secondSlot.from);
    const secondEnd = moment(secondSlot.to);

    return firstStart.isBefore(secondEnd) && secondStart.isBefore(firstEnd);
}

router.post("/bookcar", auth(['user']), async (req, res) => {
    const { car, bookedTimeSlot } = req.body;

    try {
        if (!car || !bookedTimeSlot?.from || !bookedTimeSlot?.to) {
            return res.status(400).json({ message: 'Car and valid time slot are required' });
        }

        if (!moment(bookedTimeSlot.from).isValid() || !moment(bookedTimeSlot.to).isValid() || !moment(bookedTimeSlot.from).isBefore(moment(bookedTimeSlot.to))) {
            return res.status(400).json({ message: 'Please select a valid start and end time' });
        }

        const existingBookings = await Booking.find({ car, status: { $in: activeStatuses } });
        const isAvailable = !existingBookings.some(booking => isOverlapping(bookedTimeSlot, booking.bookedTimeSlot));

        if (!isAvailable) {
            return res.status(400).json({ message: 'Car is already booked at the selected time slot' });
        }

        const newBooking = new Booking({
            ...req.body,
            user: req.auth.id,
            transactionId: randomUUID(),
            status: req.body.driverRequired ? 'Driver Confirmation Pending' : 'Confirmed'
        });
        await newBooking.save();

        const carToUpdate = await Car.findOne({ _id: car });
        if (!carToUpdate) {
            return res.status(404).json({ message: 'Car not found' });
        }
        carToUpdate.bookedTimeSlot.push({
            ...bookedTimeSlot,
            status: newBooking.status,
            bookingId: newBooking._id
        });
        await carToUpdate.save();

        res.send('Your booking is successful!');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request' });
    }
});

router.get("/getallbookings", auth(['user', 'driver', 'admin']), async (req, res) => {
    try {
        let query = {};
        if (req.auth.role === 'user') {
            query.user = req.auth.id;
        }
        if (req.auth.role === 'driver') {
            query = {
                driverRequired: true,
                status: { $in: ['Driver Confirmation Pending', 'Pending', 'Confirmed'] },
                $or: [{ driver: req.auth.id }, { driver: { $exists: false } }, { driver: null }]
            };
        }

        const bookings = await Booking.find(query).populate('car').populate('user', 'username fullName phoneNumber email').populate('driver', 'username fullName phoneNumber email');
        res.send(bookings);
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/checkAvailability', auth(['user']), async (req, res) => {
    const { carId, from, to } = req.body;
    try {
        const bookings = await Booking.find({ car: carId, status: { $in: activeStatuses } });

        const isAvailable = !bookings.some(booking => isOverlapping({ from, to }, booking.bookedTimeSlot));

        res.send({ isAvailable });
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/cancelBooking', auth(['user', 'admin']), async (req, res) => {
    const { bookingId } = req.body;
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        if (req.auth.role === 'user' && booking.user.toString() !== req.auth.id) {
            return res.status(403).json({ message: 'You can only cancel your own booking' });
        }
        booking.status = 'Cancelled';
        await booking.save();
        await Car.updateOne(
            { _id: booking.car, 'bookedTimeSlot.bookingId': booking._id },
            { $set: { 'bookedTimeSlot.$.status': 'Cancelled' } }
        );
        res.send('Booking cancelled successfully');
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/updateStatus', auth(['admin']), async (req, res) => {
    const { bookingId, status } = req.body;
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        booking.status = status;
        await booking.save();
        await Car.updateOne(
            { _id: booking.car, 'bookedTimeSlot.bookingId': booking._id },
            { $set: { 'bookedTimeSlot.$.status': status } }
        );
        res.send('Booking status updated successfully');
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.post('/confirmDriver', auth(['driver']), async (req, res) => {
    const { bookingId } = req.body;
    try {
      const booking = await Booking.findById(bookingId).populate('user').populate('car');
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }
      if (booking.driverConfirmed) {
        return res.status(400).json({ message: 'Booking already confirmed by another driver' });
      }
      booking.driver = req.auth.id;
      booking.driverConfirmed = true;
      booking.status = 'Confirmed';
      await booking.save();
      await Car.updateOne(
        { _id: booking.car, 'bookedTimeSlot.bookingId': booking._id },
        { $set: { 'bookedTimeSlot.$.status': 'Confirmed' } }
      );
      res.send('Booking confirmed by driver successfully');
    } catch (error) {
      return res.status(400).json({ error: 'An error occurred while confirming the booking' });
    }
  });

module.exports = router;

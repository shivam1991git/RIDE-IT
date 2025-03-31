import axios from 'axios';
import { message } from 'antd';

export const checkAvailability = (carId, from, to) => async dispatch => {
    try {
        const response = await axios.post('/api/bookings/checkAvailability', { carId, from, to });
        return response.data.isAvailable;
    } catch (error) {
        message.error('Something went wrong');
        return false;
    }
};

export const bookCar = (reqObj) => async dispatch => {
    dispatch({ type: 'LOADING', payload: true });

    try {
        await axios.post('/api/bookings/bookcar', reqObj);
        dispatch({ type: 'LOADING', payload: false });
        message.success("Booking Confirmed!");
        setTimeout(() => {
            window.location.href = "/userbooking";
        }, 500);
    } catch (error) {
        dispatch({ type: 'LOADING', payload: false });
        if (error.response && error.response.data && error.response.data.message) {
            message.error(error.response.data.message);
        } else {
            message.error("Something went wrong, please try later!");
        }
    }
};

export const getAllBookings = () => async dispatch => {
    dispatch({ type: 'LOADING', payload: true });

    try {
        const response = await axios.get('/api/bookings/getallbookings');
        dispatch({ type: 'GET_ALL_BOOKINGS', payload: response.data });
        dispatch({ type: 'LOADING', payload: false });
    } catch (error) {
        dispatch({ type: 'LOADING', payload: false });
    }
};

// User cancellation
export const cancelBooking = (bookingId) => async dispatch => {
    dispatch({ type: 'LOADING', payload: true });
    try {
        await axios.post('/api/bookings/cancelBooking', { bookingId });
        message.success('Booking cancelled successfully');
        dispatch({ type: 'LOADING', payload: false });
        dispatch(getAllBookings()); // Refresh the bookings list
    } catch (error) {
        message.error('Something went wrong');
        dispatch({ type: 'LOADING', payload: false });
    }
};

// Admin cancellation
export const updateBookingStatus = (bookingId, status) => async dispatch => {
    dispatch({ type: 'LOADING', payload: true });
    try {
        await axios.post('/api/bookings/updateStatus', { bookingId, status });
        message.success('Booking status updated successfully');
        dispatch({ type: 'LOADING', payload: false });
        dispatch(getAllBookings()); // Refresh the bookings list
    } catch (error) {
        message.error('Something went wrong');
        dispatch({ type: 'LOADING', payload: false });
    }
};

export const confirmDriverBooking = (bookingId, driverId) => async dispatch => {
    dispatch({ type: 'LOADING', payload: true });
    try {
        await axios.post('/api/bookings/confirmDriver', { bookingId, driverId });
        message.success('Booking confirmed by driver successfully');
        dispatch({ type: 'LOADING', payload: false });
        dispatch(getAllBookings()); // Refresh the bookings list
    } catch (error) {
        message.error('Something went wrong');
        dispatch({ type: 'LOADING', payload: false });
    }
};
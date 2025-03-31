import React, { useState, useEffect } from 'react';
import { Col, Row, Divider, DatePicker, Checkbox, Modal, message } from 'antd';
import { useSelector, useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import DefaultLayout from '../components/DefultLayout';
import Spinner from '../components/Spinner';
import { getAllCars } from '../redux/actions/carsActions';
import moment from 'moment';
import { bookCar } from '../redux/actions/bookingActions';
import StripeCheckout from 'react-stripe-checkout';

const { RangePicker } = DatePicker;

function BookingCar() {
    const { carid } = useParams();
    const { cars } = useSelector(state => state.carsReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const dispatch = useDispatch();
    const [car, setCar] = useState({});
    const [from, setFrom] = useState();
    const [to, setTo] = useState();
    const [totalHours, setTotalHours] = useState(0);
    const [driver, setDriver] = useState(false);
    const [totalAmount, setTotalAmount] = useState(0);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        dispatch(getAllCars());
    }, [dispatch]);

    useEffect(() => {
        if (cars.length > 0) {
            const foundCar = cars.find(o => o._id === carid);
            if (foundCar) {
                setCar(foundCar);
            }
        }
    }, [cars, carid]);

    useEffect(() => {
        const total = totalHours * car.rentPerHour + (driver ? 30 * totalHours : 0);
        setTotalAmount(total);
    }, [totalHours, car.rentPerHour, driver]);

    function selectTimeSlots(values) {
        if (!values || values.length < 2) {
            message.error('Please select valid time slots.');
            return;
        }
        setFrom(moment(values[0].format('MM DD YYYY HH:mm')));
        setTo(moment(values[1].format('MM DD YYYY HH:mm')));
        setTotalHours(values[1].diff(values[0], 'hours'));
    }

    function onToken(token) {
        const reqObj = {
            token,
            user: JSON.parse(localStorage.getItem('user'))._id,
            car: car._id,
            totalHours,
            totalAmount,
            driverRequired: driver,
            bookedTimeSlot: { from, to },
        };
        dispatch(bookCar(reqObj));
    }

    return (
        <div className='bookingcar'>
            <DefaultLayout>
                {loading && <Spinner />}
                <Row justify='center' className='d-flex align-items-center' style={{ minHeight: '90vh' }}>
                    <Col lg={10} sm={24} xs={24}>
                        {car.image && (
                            <img
                                src={car.image}
                                className='carimg2 bs1'
                                alt='Car'
                                style={{ width: 'auto', maxWidth: 'auto' }}
                            />
                        )}
                    </Col>
                    <Col lg={10} sm={24} xs={24} className='text-right'>
                        <div style={{ borderBottom: '2px dashed #000' }} className='mb-4'>
                            <Divider type='horizontal' dashed={true} style={{ width: '70px' }}>
                                Car Info
                            </Divider>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p>{car.name}</p>
                            <p> Rent Per Hour/- ${car.rentPerHour}</p>
                            <p>Fuel Type: {car.fuelType}</p>
                            <p>Max Person: {car.capacity}</p>
                        </div>
                        <div style={{ borderBottom: '2px dashed #000' }} className='mb-4'>
                            <br />
                            <button className='bt1 mt-2' onClick={() => { setShowModal(true) }}>See Booked TimeSlots</button>
                            {car.name && (
                                <Modal
                                    visible={showModal}
                                    closable={false}
                                    footer={false}
                                    title='Booked Time Slots'
                                >
                                    <div className='p-2'>
                                        {car.bookedTimeSlot.filter(slot => slot.status === 'Pending').map((slot, index) => (
                                            <button key={index} className='btn1 mt-2'>
                                                {slot.from} - {slot.to}
                                            </button>
                                        ))}
                                        <div className='text-right mt-5'>
                                            <button className='btn1' onClick={() => { setShowModal(false); }}>
                                                CLOSE
                                            </button>
                                        </div>
                                    </div>
                                </Modal>
                            )}
                            <Divider type='horizontal' dashed={true} style={{ width: '70px' }}>Set Time Slot</Divider>
                        </div>
                        <RangePicker
                            showTime={{ format: 'HH:mm' }}
                            format='MM DD YYYY HH:mm'
                            onChange={selectTimeSlots}
                            disabledDate={current => current && (current < moment().startOf('day') || current > moment().add(15, 'days'))}
                        />
                        {from && to && (
                            <div>
                                <p>Total Hours: {totalHours}</p>
                                <p>Rent Per Hour: <b>{car.rentPerHour}</b></p>
                                <Checkbox onChange={e => setDriver(e.target.checked)}>Driver Required</Checkbox>
                                <h1>Total Amount: {totalAmount}</h1>
                                <StripeCheckout
                                    shippingAddress
                                    token={onToken}
                                    currency='inr'
                                    amount={totalAmount * 100}
                                    stripeKey=''
                                >
                                    <button className='btn1'>
                                        Book Now
                                    </button>
                                </StripeCheckout>
                            </div>
                        )}
                    </Col>
                </Row>
            </DefaultLayout>
        </div>
    );
}

export default BookingCar;

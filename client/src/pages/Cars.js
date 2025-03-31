import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import DefultLayout from '../components/DefultLayout';
import { getAllCars } from '../redux/actions/carsActions';
import { Row, Col } from 'antd';
import { Link } from 'react-router-dom';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';
import { motion, AnimatePresence } from 'framer-motion';

const Choosecar = () => {
    const { cars } = useSelector(state => state.carsReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const [totalCars, setTotalcars] = useState([]);
    const dispatch = useDispatch();
    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        dispatch(getAllCars());
    }, [dispatch]);

    const containerVariants = {
        hidden: { opacity: 0, x: -50 },
        visible: {
            opacity: 1,
            x: 0,
            transition: {
                type: 'spring',
                stiffness: 50,
                staggerChildren: 0.3,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'linear' } },
    };

    return (
        <div className='home'>
            <DefultLayout />

            {loading && <Spinner />}

            <h1 className='text-center' style={{ color: 'gold' }}>Select Best Car for You 😊!</h1>

            <motion.div
                className='mt-5 mb-3'
                initial="hidden"
                animate="visible"
                variants={containerVariants}
            >
                <Row justify='center' gutter={16}>
                    {cars.map(car => (
                        <Col lg={5} sm={24} xs={24} key={car._id}>
                            <motion.div className='car p-2 bs1' variants={itemVariants}>
                                <img src={car.image} className='carimg' alt={car.name} />
                                <div className='car-content d-flex align-items-center justify-content-between'>
                                    <div className='text-left pl-2'>
                                        <p>{car.name}</p>
                                        <p> Rent Per Hour /- {car.rentPerHour}</p>
                                    </div>
                                    {user ? (
                                        <div>
                                            <button className='btn1 mr-2'><Link to={`/booking/${car._id}`}>Book Now</Link></button>
                                        </div>
                                    ) : null}
                                </div>
                            </motion.div>
                        </Col>
                    ))}
                </Row>
            </motion.div>
            <Footer />
        </div>
    );
}

export default Choosecar;

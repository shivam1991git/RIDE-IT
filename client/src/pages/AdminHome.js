import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import DefultLayout from '../components/DefultLayout';
import { deleteCar, getAllCars } from '../redux/actions/carsActions';
import { Row, Col, Popconfirm, message } from 'antd';
import { Link } from 'react-router-dom';
import Spinner from '../components/Spinner';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import Footer from '../components/footer';
import { motion } from 'framer-motion';

const AdminHome = () => {
  const { cars } = useSelector(state => state.carsReducer);
  const { loading } = useSelector(state => state.alertsReducer);
  const [totalCars, setTotalcars] = useState([]);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(getAllCars());
  }, [dispatch]);

  useEffect(() => {
    setTotalcars(cars);
  }, [cars]);

  const handleDelete = (carId) => {
    dispatch(deleteCar({ carid: carId }));
    message.success('Car deleted successfully');
  };

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
      
      <Row justify='center' gutter={16} className='mt-2'>
        <Col lg={20} sm={24}>
          <div className='text-right'>
            <motion.div
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.05, transition: { duration: 0.3, ease: 'linear' } }}
            >
              <button className='btn1'>
                <Link to='/addcar'>ADD CAR</Link>
              </button>
            </motion.div>
          </div>
        </Col>
      </Row>

      {loading && <Spinner />}

      <motion.div
        className='mt-5 mb-3'
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <Row justify='center' gutter={16}>
          {totalCars.map(car => (
            <Col lg={5} sm={24} xs={24} key={car._id}>
              <motion.div className='car p-2 bs1' variants={itemVariants}>
                <img src={car.image} className='carimg' alt={car.name} />

                <div className='car-content d-flex align-items-center justify-content-between'>
                  <div className='text-left pl-2'>
                    <p>{car.name}</p>
                    <p> Rent Per Hour /- {car.rentPerHour}</p>
                  </div>
                  <div className='mr-4'>
                    <Link to={`/editcar/${car._id}`}>
                      <EditOutlined className='mr-3' style={{ color: 'yellow', cursor: 'pointer' }} />
                    </Link>
                    <Popconfirm
                      title="Delete the car"
                      description="Are you sure to delete this car?"
                      onConfirm={() => handleDelete(car._id)}
                      okText="Yes"
                      cancelText="No"
                    >
                      <DeleteOutlined style={{ color: 'red', cursor: 'pointer' }} />
                    </Popconfirm>
                  </div>
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

export default AdminHome;

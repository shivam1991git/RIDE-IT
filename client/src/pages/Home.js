import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import DefaultLayout from '../components/DefultLayout';
import { getAllCars } from '../redux/actions/carsActions';
import { Row, Col, Select, Button, Form, Card, Avatar } from 'antd';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';
import { motion } from 'framer-motion';

const { Option } = Select;

function Home() {
  const user = JSON.parse(localStorage.getItem('user'));
  const driver = JSON.parse(localStorage.getItem('driver'));

  const { cars } = useSelector(state => state.carsReducer);
  const { loading } = useSelector(state => state.alertsReducer);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    dispatch(getAllCars());
  }, [dispatch]);

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const handleBooking = () => {
    if (pickup && dropoff) {
      navigate('/cars');
    } else {
      console.log("Please select both pickup and dropoff locations.");
    }
  };

  const places = [
    'Varanasi Cantt', 'Assi Ghat', 'Dashashwamedh Ghat', 'Kashi Vishwanath Temple',
    'Banaras Hindu University', 'Sarnath', 'Godowlia', 'Lanka', 'Ramnagar Fort'
  ];

  const guestReviews = [
    {
      name: "John Doe",
      review: "Great service and comfortable ride. Highly recommended!",
      image: "assets/images/carrr.jpg"
    },
    {
      name: "Jane Smith",
      review: "Easy booking process and friendly drivers. Will use again.",
      image: "assets/images/carrr.jpg"
    },
    {
      name: "Sam Wilson",
      review: "Affordable prices and wide selection of cars. Very satisfied.",
      image: "assets/images/carrr.jpg"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 50,
        when: "beforeChildren",
        staggerChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'linear' },
    },
  };

  const textVariants = {
    hidden: { opacity: 0, x: -50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 1, ease: 'easeInOut' },
    },
  };

  const buttonVariants = {
    hover: { scale: 1.1, transition: { yoyo: Infinity } },
  };

  return (
    <div>
      <motion.div
        className='home2-container'
        style={{ backgroundImage: 'url(assets/images/carrr.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <DefaultLayout />
        {loading && (<Spinner />)}

        <motion.div className="main-container" style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={itemVariants}>
          <div className="background-text">
            {user ? (
              <h2 style={{ color: 'white' }} variants={textVariants}>Enjoy Best <span>Ride now!</span></h2>
            ) : null}
            {driver ? (
              <motion.h2 style={{ color: 'white' }} variants={textVariants}>Want to See <span>New Arrivals!</span>
                <span> <Link to="/services" className="booknow" style={{ color: 'Blue' }}>New</Link></span>
              </motion.h2>
            ) : null}
          </div>
        </motion.div>

        {/* Pickup and Dropoff Location Section (Visible only to users) */}
        <motion.div
          style={{ padding: '10px', border: '1px solid black', backgroundColor: 'white', color: 'black', borderRadius: '50px', maxWidth: '900px', margin: '20px auto', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}
          variants={itemVariants}
        >
          {user && (
            <Row justify='center' className='mt-4' style={{ color: 'Blue' }}>
              <Col>
                <Form layout="inline">
                  <Form.Item label="Pickup Location">
                    <Select
                      placeholder="Select Pickup Location"
                      value={pickup}
                      onChange={value => setPickup(value)}
                      style={{ width: 200 }}
                    >
                      {places.map(place => (
                        <Option key={place} value={place}>{place}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item>
                    <div style={{ borderLeft: '1px solid black', height: '32px', margin: '0 8px' }}></div>
                  </Form.Item>
                  <Form.Item label="Dropoff Location">
                    <Select
                      placeholder="Select Dropoff Location"
                      value={dropoff}
                      onChange={value => setDropoff(value)}
                      style={{ width: 200 }}
                    >
                      {places.map(place => (
                        <Option key={place} value={place}>{place}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item>
                    <div style={{ borderLeft: '1px solid black', height: '32px', margin: '0 8px' }}></div>
                  </Form.Item>
                  <Form.Item>
                    <motion.div variants={buttonVariants} whileHover="hover">
                      <Button type="primary" onClick={handleBooking}>Search 🚗</Button>
                    </motion.div>
                  </Form.Item>
                </Form>
              </Col>
            </Row>
          )}
        </motion.div>
      </motion.div>

      <motion.div style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={containerVariants}>
        {/* How to Rent a Car Section */}
        <motion.div
          style={{ padding: '50px 20px', backgroundColor: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', margin: '20px auto', borderRadius: '10px', maxWidth: '900px', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}
          variants={itemVariants}
        >
          <h4>How to Rent a Car with RIDE'IT</h4>
          <Row justify='center' gutter={16} className='mt-4'>
            {["Step 1: Login to RIDE'IT", "Step 2: Choose Your Location", "Step 3: Select Your Car", "Step 4: Confirm Your Booking"].map((step, index) => (
              <Col key={index} lg={5} sm={24} xs={24}>
                <motion.div
                  className="how-to-box"
                  style={{ padding: '10px', border: '1px solid gray', borderRadius: '10px', marginBottom: '10px', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}
                  variants={itemVariants}
                >
                  <p>{step}</p>
                </motion.div>
              </Col>
            ))}
          </Row>
        </motion.div>

        <Row justify='center' className='mt-2'>
          <Col>
            <h3 style={{ textAlign: 'center', marginTop: '20px' }}>Our Cars</h3>
          </Col>
        </Row>

        <Row justify='center' gutter={16} className='mt-2 mb-2' style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
          {cars.slice(0, 4).map(car => (
            <Col key={car.id} lg={5} sm={24} xs={24}>
              <motion.div className='car p-2 bs1' style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={itemVariants}>
                <img src={car.image} className='carimg' alt={car.name} />
                <div className='car-content d-flex align-items-center justify-content-between'>
                  <div className='text-left pl-2'>
                    <p>{car.name}</p>
                  </div>
                  <div>
                  </div>
                </div>
              </motion.div>
            </Col>
          ))}
        </Row>
      </motion.div>

      <motion.div style={{ backgroundColor: 'rgba(237, 233, 221, 0.5)', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={containerVariants}>
        <Row justify='center' className='mt-2'>
          <Col>
            <h4 style={{ textAlign: 'center', marginTop: '4rem', marginBottom: '3rem' }}>Why Choose Us <span style={{ fontSize: '42px' }}>🤔</span></h4>
          </Col>
        </Row>
        <Row justify='center' gutter={16} className='mt-2 mb-2'>
          <Col>
            <motion.div className="feature-box" style={{ backgroundColor: 'lightgrey', padding: '10px', borderRadius: '8px', textAlign: 'center', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={itemVariants}>
              <p className="feature">Our App Rating : <span style={{ fontSize: '25px' }}>4.5 ⭐</span></p>
            </motion.div>
          </Col>
          {["Wide Selection of Vehicles 🚗", "24/7 Customer Support 🕒", "Secure Booking 🔒"].map((feature, index) => (
            <Col key={index} lg={5} sm={24} xs={24}>
              <motion.div className="feature-box" style={{ backgroundColor: 'lightgrey', padding: '10px', borderRadius: '8px', textAlign: 'center', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={itemVariants}>
                <p className="feature">{feature}</p>
              </motion.div>
            </Col>
          ))}
        </Row>

        {/* Guest Reviews Section */}
        <motion.div style={{ padding: '50px 20px', backgroundColor: 'rgba(237, 233, 221, 0.5)', margin: '20px auto', borderRadius: '10px', maxWidth: '900px', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }} variants={itemVariants}>
          <h4 style={{ textAlign: 'center', marginBottom: '40px' }}>What Our Guests Say</h4>
          <Row justify='center' gutter={16} className='mt-4'>
            {guestReviews.map((review, index) => (
              <Col key={index} lg={8} sm={24} xs={24}>
                <motion.div variants={itemVariants}>
                  <Card style={{ marginBottom: '20px', boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
                    <Card.Meta
                      avatar={<Avatar src={review.image} />}
                      title={review.name}
                      description={review.review}
                    />
                  </Card>
                </motion.div>
              </Col>
            ))}
          </Row>
        </motion.div>

        <Footer />
      </motion.div>
    </div>
  );
}

export default Home;

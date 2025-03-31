import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import DefaultLayout from '../components/DefultLayout';
import Footer from '../components/footer';

const Services = () => {
  const [seen, setSeen] = useState(false);
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  const togglePop = () => {
    setSeen(!seen);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    togglePop();
    window.location.href = '/cars';
  };

  const sectionVariants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'linear' } },
  };

  return (
    <div className="servicebody">
      <DefaultLayout />
      <h3>Our Services</h3>
      <AnimatePresence>
        {seen && (
          <motion.div
            className="popup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="popup-inner"
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.5 }}
              transition={{ duration: 0.3 }}
            >
              <form onSubmit={handleLogin}>
                <label>
                  Pickup Location:
                  <input type="text" required value={pickupLocation} onChange={e => setPickupLocation(e.target.value)} />
                </label>
                <label>
                  Dropoff Location:
                  <input type="text" required value={dropoffLocation} onChange={e => setDropoffLocation(e.target.value)} />
                </label>
                <button type="submit">Ok</button>
              </form>
              <button onClick={togglePop}>Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="main-tariff">
        <motion.section className="first" variants={sectionVariants} initial="hidden" animate="visible">
          <div className="secImg" style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
            <img src="assets/images/airport.webp" alt="tour1" />
          </div>
          <div>
            <span>Airport Transfers</span>
            <span>Seamless transfers to and from airports with our reliable service.</span>
            {user && <button className="select-car-btn1" onClick={togglePop}>Book Now</button>}
          </div>
        </motion.section>

        <div className="separation"></div>

        <motion.section className="first second" variants={sectionVariants} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          <div className="secImg" style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
            <img src="assets/images/chicago-city-lights-at-night.jpg" alt="" />
          </div>
          <div>
            <span>City Tours</span>
            <span>Discover the beauty of your city with our city tour packages.</span>
            {user && <button className="select-car-btn1" onClick={togglePop}>Book Now</button>}
          </div>
        </motion.section>

        <div className="separation"></div>

        <motion.section className="first" variants={sectionVariants} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
          <div className="secImg" style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
            <img src="assets/images/rr.png" alt="tour1" />
          </div>
          <div>
            <span>Car Rentals</span>
            <span>Seamless transfers to and from airports with our reliable service.</span>
            {user && <Link to="/cars" className="select-car-btn">Select Car</Link>}
          </div>
        </motion.section>

        <div className="separation"></div>

        <motion.section className="first second" variants={sectionVariants} initial="hidden" animate="visible" transition={{ delay: 0.6 }}>
          <div className="secImg" style={{ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' }}>
            <img src="assets/images/india-varanasi-best-places-to-visit-dasaswamedh-ghat.jpg" alt="" />
          </div>
          <div>
            <span>Holiday Trip</span>
            <span>Discover the beauty of your city with our city tour packages.</span>
            <Link to="/touristpoint" className="select-car-btn">Select Place</Link>
          </div>
        </motion.section>

        <Footer />
      </div>
    </div>
  );
};

export default Services;

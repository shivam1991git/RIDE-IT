import React from 'react';
import { Card, Col, Row } from 'antd';
import DefaultLayout from '../components/DefultLayout';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import Footer from '../components/footer';
import Spinner from '../components/Spinner';
import { motion } from 'framer-motion';

const cardVariants = {
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

const cardHover = {
  scale: 1.05,
  transition: { duration: 0.3, ease: 'linear' },
};

const App = () => {
  const { loading } = useSelector(state => state.alertsReducer);

  return (
    <div className='home'>
      {loading && <Spinner />}
      <DefaultLayout>
        <div style={{ padding: '20px', marginTop: '5rem' }}>
          <Row gutter={12} justify="center">
            {[
              { key: '1', link: '/adminuser', img: 'assets/images/testimonial_back.png', label: 'Users', delay: 0 },
              { key: '2', link: '/admindriver', img: 'assets/images/driver.jpeg', label: 'Drivers', delay: 0.1 },
              { key: '3', link: '/admin', img: 'assets/images/rr.png', label: 'Cars', delay: 0.2 },
              { key: '4', link: '/adminfeedback', img: 'assets/images/feedback.jpg', label: 'Feedbacks', delay: 0.3 },
              { key: '5', link: '/adminbookings', img: 'assets/images/booking.jpg', label: 'Bookings', delay: 0.4 },
            ].map(card => (
              <Col span={6} key={card.key}>
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={cardVariants}
                  transition={{ delay: card.delay }}
                  whileHover={cardHover}
                >
                  <Card
                    className='card1'
                    hoverable
                    style={{ marginBottom: '20px', backgroundColor: 'blue', height: '300px' }}
                    cover={<img alt={`Card Image ${card.key}`} src={card.img} height='200px' />}
                  >
                    <Link to={card.link} style={{ color: 'gold', display: 'block', textAlign: 'center', height: '100%' }}>
                      <h3>{card.label}</h3>
                    </Link>
                  </Card>
                </motion.div>
              </Col>
            ))}
          </Row>
        </div>
      </DefaultLayout>
      <Footer />
    </div>
  );
}

export default App;

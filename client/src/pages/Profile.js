import React from 'react';
import { Row, Col, Typography, Card } from 'antd';
import Footer from '../components/footer';
import DefultLayout from '../components/DefultLayout'
const { Title } = Typography;

function Profile(props) {
  const user = JSON.parse(localStorage.getItem('user'));
  const driver = JSON.parse(localStorage.getItem('driver'));
  const admin = JSON.parse(localStorage.getItem('admin'));

  return (
    <div className='profilehome'>
    <DefultLayout />
      {user ? (
        <div className="driver-profile">
          <Row justify="center">
            <Col>
              <Title level={2} className="title">Profile</Title>
            </Col>
          </Row>
          <Row justify="center" className="card-container">
            <Col xs={24} sm={20} md={16} lg={12}>
              <Card className="card">
                <p><strong>Full Name:</strong> {user.fullName}</p>
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Phone Number:</strong> {user.phoneNumber}</p>
                <p><strong>Address:</strong> {user.address}</p>
                <p><strong>Pincode:</strong> {user.pincode}</p>
                <p><strong>State:</strong> {user.state}</p>
              </Card>
            </Col>
          </Row>
        </div>
      ) : null}
      {driver ? (
        <div className="driver-profile">
          <Row justify="center">
            <Col>
              <Title level={2} className="title-p">Profile</Title>
            </Col>
          </Row>
          <Row justify="center" className="card-container">
            <Col xs={24} sm={20} md={16} lg={12}>
              <Card className="card">
                <p><strong>Full Name:</strong> {driver.fullName}</p>
                <p><strong>Username:</strong> {driver.username}</p>
                <p><strong>Email:</strong> {driver.email}</p>
                <p><strong>Phone Number:</strong> {driver.phoneNumber}</p>
                <p><strong>Address:</strong> {driver.address}</p>
                <p><strong>Pincode:</strong> {driver.pincode}</p>
                <p><strong>State:</strong> {driver.state}</p>
              </Card>
            </Col>
          </Row>
        </div>
      ) : null}
      {admin ? (
        <div className="driver-profile">
          <Row justify="center">
            <Col>
              <Title level={2} className="title">Profile</Title>
            </Col>
          </Row>
          <Row justify="center" className="card-container">
            <Col xs={24} sm={20} md={16} lg={12}>
              <Card className="card">
                <p><strong>Full Name:</strong> {admin.fullName}</p>
                <p><strong>Username:</strong> {admin.username}</p>
                <p><strong>Email:</strong> {admin.email}</p>
                <p><strong>Phone Number:</strong> {admin.phoneNumber}</p>
                <p><strong>Address:</strong> {admin.address}</p>
                <p><strong>Pincode:</strong> {admin.pincode}</p>
                <p><strong>State:</strong> {admin.state}</p>
                
              </Card>
            </Col>
          </Row>
        </div>
      ) : null}

      <div className='content'>
        {props.children}
      </div>
      <Footer />
    </div>
  );
}

export default Profile;

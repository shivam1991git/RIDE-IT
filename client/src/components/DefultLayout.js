import React, { useState } from 'react';
import { Menu, Dropdown, Button, Space, Row, Col } from 'antd';
import { Link } from 'react-router-dom';

function DefaultLayout(props) {
  const [showLinks, setShowLinks] = useState(true);
  const user = JSON.parse(localStorage.getItem('user'));
  const driver = JSON.parse(localStorage.getItem('driver'));
  const admin = JSON.parse(localStorage.getItem('admin'));

  const logoutUser = () => {
    localStorage.removeItem('user');
   
  };

  const logoutDriver = () => {
    localStorage.removeItem('driver');
    
  };

  const logoutAdmin = () => {
    localStorage.removeItem('admin');
   
  };

  const toggleLinks = () => {
    setShowLinks(!showLinks);
  };

  return (
    <div>
      <div className='header bs1'>
        <Row gutter={16} justify='center'>
          <Col lg={20} sm={24} xs={24}>
            <div className='d-flex justify-content-between'>
              <Link to={admin ? '/admindashboard' : '/'} ><img src="assets/images/RIDE_IT.png" alt="Website Logo" className="footer-logo"></img></Link>
              <Space size="middle" className="center-links">
                {showLinks ? (
                  <>
                    <Link to={admin ? '/admindashboard' : '/'} className="nav-link">Home</Link>
                    <Link to="/services" className="nav-link">Services</Link>
                    <Link to="/cars" className="nav-link">Cars</Link>
                    <Link to="/about" className="nav-link">About</Link>
                    <Link to="/contact" className="nav-link">Contact</Link>
                  </>
                ) : (
                  <img src="assets/images/menu.png" alt="Menu" className="svg-menu" onClick={toggleLinks} />
                )}
                {user ? (
                  <Dropdown overlay={
                    <Menu>
                      <Menu.Item>
                        <Link to="/profile">Profile</Link>
                      </Menu.Item>
                      <Menu.Item>
                        <Link to="/userbooking">My Bookings</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutUser}>
                        <Link to="/driverlogin">Driver Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutUser}>
                        <Link to="/adminlogin">Admin Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutUser}>
                      <Link to="/login">Logout</Link>
                      </Menu.Item>
                    </Menu>
                  } placement="bottomLeft">
                    <Button>{user.username}</Button>
                  </Dropdown>
                ) : null}
                {driver ? (
                  <Dropdown overlay={
                    <Menu>
                      <Menu.Item>
                        <Link to="/profile">Profile</Link>
                      </Menu.Item>
                      <Menu.Item>
                        <Link to="/driverbookings">History</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutDriver}>
                        <Link to="/login">User Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutDriver}>
                        <Link to="/adminlogin">Admin Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutDriver}>
                       <Link to='/driverlogin'>Logout</Link> 
                      </Menu.Item>
                    </Menu>
                  } placement="bottomLeft">
                    <Button>{driver.username}</Button>
                  </Dropdown>
                ) : null}
                {admin ? (
                  <Dropdown overlay={
                    <Menu>
                      <Menu.Item>
                        <Link to="/profile">Profile</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutAdmin}>
                        <Link to="/login">User Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutAdmin}>
                        <Link to="/driverlogin">Driver Login</Link>
                      </Menu.Item>
                      <Menu.Item onClick={logoutAdmin}>
                      <Link to="/adminlogin">Logout</Link>
                      </Menu.Item>
                    </Menu>
                  } placement="bottomLeft">
                    <Button>{admin.username}</Button>
                  </Dropdown>
                ) : null}
              </Space>
            </div>
          </Col>
        </Row>
      </div>
      <div className='content'>
        {props.children}
      </div>
    </div>
  );
}

export default DefaultLayout;
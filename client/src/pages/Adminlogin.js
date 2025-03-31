import React from 'react';
import { Row, Col, Form, Input } from 'antd';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { adminLogin } from '../redux/actions/adminActions';
import Spinner from '../components/Spinner';
import AOS from 'aos';
import 'aos/dist/aos.css';

AOS.init();

function AdminLogin() {
  const dispatch = useDispatch();
  const { loading } = useSelector(state => state.alertsReducer);

  function onFinish(values) {
    dispatch(adminLogin(values));
    console.log(values);
  }

  return (
    <div className='login'>
      {loading && (<Spinner />)}
      <Row gutter={16} className='d-flex align-items-center'>
        <Col lg={16} style={{ position: 'relative' }}>
          <img
            data-aos='slide-right'
            data-aos-duration='1500'
            className='login-image'
            src='https://images.unsplash.com/photo-1471479917193-f00955256257?q=80&w=1931&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
          />
          <h1
            data-aos='slide-left'
            data-aos-duration='1500'
            className='login-logo'>RIDE'IT</h1>
        </Col>
        <Col lg={8} className='text-left p-5'>
          <Form
            data-aos='slide-left'
            data-aos-duration='1500'
            layout='vertical'
            className='login-form p-5'
            onFinish={onFinish}
          >
            <h1>Admin Login</h1>
            <hr />
            <Form.Item name='username' label='username' rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name='password' label='password' rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <button className='btn1 mt-2'>Login</button>
            {/* Third party authentication */}
            <div className="h-screen w-screen flex justify-center items-center dark:bg-gray-900">
              <div className="grid gap-8">
                <div
                  id="third-party-auth"
                  className="flex items-center justify-center mt-5 flex-wrap"
                >
                  <button
                    href="#"
                    className="hover:scale-105 ease-in-out duration-300 shadow-lg p-2 rounded-lg m-1"
                  >
                    <img
                      style={{ maxWidth: '20px' }} // Decrease the icon size inline
                      src="https://ucarecdn.com/8f25a2ba-bdcf-4ff1-b596-088f330416ef/"
                      alt="Google"
                    />
                  </button>
                  <button
                    href="#"
                    className="hover:scale-105 ease-in-out duration-300 shadow-lg p-2 rounded-lg m-1"
                  >
                    <img
                      style={{ maxWidth: '20px' }} // Decrease the icon size inline
                      src="https://ucarecdn.com/95eebb9c-85cf-4d12-942f-3c40d7044dc6/"
                      alt="Linkedin"
                    />
                  </button>
                  <button
                    href="#"
                    className="hover:scale-105 ease-in-out duration-300 shadow-lg p-2 rounded-lg m-1"
                  >
                    <img
                      style={{ maxWidth: '20px' }} // Decrease the icon size inline
                      src="https://ucarecdn.com/82d7ca0a-c380-44c4-ba24-658723e2ab07/"
                      alt="Twitter"
                    />
                  </button>
                  <button
                    href="#"
                    className="hover:scale-105 ease-in-out duration-300 shadow-lg p-2 rounded-lg m-1"
                  >
                    <img
                      style={{ maxWidth: '20px' }} 
                      src="https://ucarecdn.com/3277d952-8e21-4aad-a2b7-d484dad531fb/"
                      alt="Apple"
                    />
                  </button>
                </div>
              </div>
            </div>
            <br />
            <Link to='/login'>Click Here for User Login</Link>
          </Form>
        </Col>
      </Row>
    </div>
  );
}

export default AdminLogin;

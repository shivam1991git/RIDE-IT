import React from 'react';
import { Row, Col, Form, Input } from 'antd';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { userRegister } from '../redux/actions/userActions';
import Spinner from '../components/Spinner';
import AOS from 'aos';
import 'aos/dist/aos.css';

AOS.init();

function Register() {
  const dispatch = useDispatch();
  const { loading } = useSelector(state => state.alertsReducer);

  function onFinish(values) {
    dispatch(userRegister(values));
    console.log(values);
  }

  return (
    <div className='login'>
      {loading && <Spinner />}
      <Row gutter={16} className='d-flex align-items-center'>
        <Col lg={16} style={{ position: 'relative' }}>
          <img
            data-aos='slide-left'
            data-aos-duration='1500'
            className='login-image'
            src='https://images.unsplash.com/photo-1471479917193-f00955256257?q=80&w=1931&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
            alt='Login'
          />
          <h1 data-aos='slide-right' data-aos-duration='1500' className='login-logo'>
            RIDE'IT
          </h1>
        </Col>
        <Col lg={8} className='text-left pr-5 py-2'>
          <Form
            data-aos='slide-right'
            data-aos-duration='1500'
            layout='vertical'
            className='login-form p-5'
            onFinish={onFinish}
          >
            <h1>Register 🚘</h1>
            <hr />
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name='fullName'
                  label='Full Name'
                  rules={[
                    {
                      required: true,
                      message: 'Please input your full name!',
                      pattern: /^[a-zA-Z\s]+$/,
                     
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name='username'
                  label='Username'
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name='phoneNumber'
                  label='Phone Number'
                  rules={[
                    {
                      required: true,
                      message: 'Please input your phone number!',
                      pattern: /^\d{10}$/,
                    
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name='email'
                  label='Email'
                  rules={[
                    {
                      required: true,
                      type: 'email',
                      message: 'Please input a valid email address!',
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name='pincode'
                  label='Pincode'
                  rules={[
                    {
                      required: true,
                      pattern: /^\d{6}$/,                 
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name='state'
                  label='State'
                  rules={[
                    {
                      required: true,
                      message: 'Please input your state!',
                      pattern: /^[a-zA-Z\s]+$/,
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name='address'
              label='Address'
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name='password'
              label='Password'
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name='cpassword'
              label='Confirm Password'
              dependencies={['password']}
              rules={[
                {
                  required: true
                },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('passwords not match!'));
                  },
                }),
              ]}
            >
              <Input />
            </Form.Item>
            <button className='btn1 mt-2'>Register </button>
            <br />
            <Link to='/login'>Click for here Login !</Link>
          </Form>
        </Col>
      </Row>
    </div>
  );
}

export default Register;

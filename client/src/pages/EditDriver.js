import React, { useState, useEffect } from 'react';
import DefaultLayout from "../components/DefultLayout";
import { Col, Row, Form, Input, DatePicker, Select  } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { editDriver, getAllDrivers } from '../redux/actions/driverActions';
import { useParams } from 'react-router-dom';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';
import AOS from 'aos';
import 'aos/dist/aos.css';

const { Option } = Select;
AOS.init();

function EditDriver({ match }) {
    const { driverid } = useParams();
    const { drivers } = useSelector(state => state.driversReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const dispatch = useDispatch();
    const [driver, setDriver] = useState(null);
    const [totaldrivers, setTotalDrivers] = useState([]);

    useEffect(() => {
        dispatch(getAllDrivers());
    }, [dispatch]);

    useEffect(() => {
        if (drivers.length > 0) {
            setTotalDrivers(drivers)
            const foundDriver = drivers.find(o => o._id === driverid);
            if (foundDriver) {
                setDriver(foundDriver);
            }
        }
    }, [drivers, driverid]);

    function onFinish(values) {
        values._id = driver._id
        dispatch(editDriver(values));
        console.log(values);
    }

    // Custom date validator
    function validateDate(_, value) {
        const age = value ? new Date().getFullYear() - value.year() : 0;
        if (age >= 18 && age <= 50) {
            return Promise.resolve();
        }
        return Promise.reject(new Error('Age must be between 18 and 50!'));
    }

    return (
        <div className='editcar'>
            <DefaultLayout>
                {loading && (<Spinner />)}
                <Row justify='center' className='mt-5'>
                    <Col lg={12} sm={24}>
                        {totaldrivers.length > 0 && (
                            <Form initialValues={driver} className='bs1 p-2' layout='vertical' onFinish={onFinish}>
                                <h4>Edit driver</h4>
                                {driver.fullName}
                                <hr />
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

                                <Form.Item
                                    name='username'
                                    label='Username'
                                    rules={[{ required: true }]}
                                >
                                    <Input />
                                </Form.Item>

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

                                <Form.Item
                                    name='address'
                                    label='Address'
                                    rules={[{ required: true }]}
                                >
                                    <Input />
                                </Form.Item>

                                <Form.Item
                                    name='drivingLicenseNumber'
                                    label='Driving License Number'
                                    rules={[
                                        {
                                            required: true,
                                            message: 'Please input your driving license number!',
                                        },
                                    ]}
                                >
                                    <Input />
                                </Form.Item>

                                <Form.Item
                                    name='gender'
                                    label='Gender'
                                    rules={[{ required: true, message: 'Please select your gender!' }]}
                                >
                                    <Select placeholder='Select Gender'>
                                        <Option value='male'>Male</Option>
                                        <Option value='female'>Female</Option>
                                        <Option value='other'>Other</Option>
                                    </Select>
                                </Form.Item>

                                <Form.Item
                                    name='password'
                                    label='Password'
                                    rules={[{ required: true }]}
                                >
                                    <Input />
                                </Form.Item>

                                <div className='text-right'>
                                    <button type='submit' className='btn1'>Edit Driver</button>
                                </div>
                            </Form>
                        )}
                    </Col>
                </Row>
            </DefaultLayout>
            <Footer />
        </div>
    );
}

export default EditDriver;

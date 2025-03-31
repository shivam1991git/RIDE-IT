import React from 'react'
import DefaultLayout from "../components/DefultLayout"
import { Col, Row, Form, Input, DatePicker, Select  } from 'antd'
import { useDispatch, useSelector } from 'react-redux'
import { addDriver } from '../redux/actions/driverActions'
import Spinner from '../components/Spinner'
import Footer from '../components/footer';
const { Option } = Select;
function AddDriver() {

    const dispatch = useDispatch()
    const { loading } = useSelector(state => state.alertsReducer)

    function onFinish(values) {

        dispatch(addDriver(values))
        console.log(values)
    }
    return (
        <div className='home'>
            <DefaultLayout>
                {loading && (<Spinner />)}
                <Row justify='center mt-5'>
                    <Col lg={12} sm={24}>
                        <Form className='bs1 p-2' layout='vertical' onFinish={onFinish} style={{backgroundColor:'wheat'}}>
                            <h1>Add New Driver</h1>
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
                                name='dob'
                                label='Date of Birth'
                                rules={[
                                    {
                                        required: true,
                                        message: 'Please select your date of birth!',
                                    },
                                    {
                                        validator(_, value) {
                                            const age = value ? new Date().getFullYear() - value.year() : 0;
                                            if (age >= 18 && age <= 50) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Age must be between 18 and 50!'));
                                        },
                                    },
                                ]}
                            >
                                <DatePicker style={{ width: '100%' }} />
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
                            <div className='text-right'>
                                <button type='submit' className='btn1'>Add Driver</button>
                            </div>
                        </Form>
                    </Col>
                </Row>
            </DefaultLayout>
            <Footer />
        </div>
    )
}

export default AddDriver
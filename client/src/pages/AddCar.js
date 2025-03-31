import React from 'react';
import DefaultLayout from "../components/DefultLayout";
import {Col, Row, Form, Input} from 'antd';
import {useDispatch, useSelector} from 'react-redux';
import {addCar} from '../redux/actions/carsActions';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';
import {motion} from 'framer-motion';

function AddCar() {
    const dispatch = useDispatch();
    const {loading} = useSelector(state => state.alertsReducer);

    function onFinish(values) {
        values.bookedtimeSlots = [];
        dispatch(addCar(values));
        console.log(values);
    }

    return (
        <div className='home'>
            <DefaultLayout>
                {loading && (<Spinner />)}
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <Row justify='center mt-5'>
                        <Col lg={12} sm={24}>
                            <motion.div
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                            >
                                <Form className='bs1 p-2' layout='vertical' onFinish={onFinish} style={{backgroundColor:'wheat'}}>
                                    <h1>Add New Car</h1>
                                    <hr/>
                                    <Form.Item name='name' label='Car name' rules={[{required: true}]}>
                                        <Input/>
                                    </Form.Item>
                                    <Form.Item name='image' label='Image url' rules={[{required: true}]}>
                                        <Input/>
                                    </Form.Item>
                                    <Form.Item name='rentPerHour' label='Rent per hour' rules={[{required: true}]}>
                                        <Input/>
                                    </Form.Item>
                                    <Form.Item name='capacity' label='Capacity' rules={[{required: true}]}>
                                        <Input/>
                                    </Form.Item>
                                    <Form.Item name='fuelType' label='Fuel Type' rules={[{required: true}]}>
                                        <Input/>
                                    </Form.Item>
                                    <div className='text-right'>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className='btn1'
                                        >
                                            Add Car
                                        </motion.button>
                                    </div>
                                </Form>
                            </motion.div>
                        </Col>
                    </Row>
                </motion.div>
            </DefaultLayout>
            <Footer/>
        </div>
    );
}

export default AddCar;

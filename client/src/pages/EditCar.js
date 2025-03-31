import React, { useState, useEffect } from 'react';
import DefaultLayout from "../components/DefultLayout";
import { Col, Row, Form, Input } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { editCar, getAllCars } from '../redux/actions/carsActions';
import { useParams } from 'react-router-dom';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';

function EditCar({ match }) {
    const { carid } = useParams();
    const { cars } = useSelector(state => state.carsReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const dispatch = useDispatch();
    const [car, setCar] = useState(null);
    const [totalcars, settotalcars] = useState([])

    useEffect(() => {
        dispatch(getAllCars());
    }, [dispatch]);

    useEffect(() => {
        if (cars.length > 0) {
            settotalcars(cars)
            const foundCar = cars.find(o => o._id === carid);
            if (foundCar) {
                setCar(foundCar);
            }
        }
    }, [cars, carid]);

    function onFinish(values) {
        values._id = car._id
        dispatch(editCar(values));

        console.log(values);
    }

    return (
        <div className='editcar'>
            <DefaultLayout>
                {loading && (<Spinner />)}
                <Row justify='center' className='mt-5'>
                    <Col lg={12} sm={24}>
                        {totalcars.length > 0 && (
                            <Form initialValues={car} className='bs1 p-2' layout='vertical' onFinish={onFinish}>
                                <h3>Edit Car</h3>
                                {car.name}
                                {cars.length}
                                <hr />
                                <Form.Item name='name' label='Car name' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='image' label='Image url' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='rentPerHour' label='Rent per hour' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='capacity' label='Capacity' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='fuelType' label='Fuel Type' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <div className='text-right'>
                                    <button type='submit' className='btn1'>Edit Car</button>
                                </div>
                            </Form>
                        )}
                    </Col>
                </Row>
            </DefaultLayout>
            <Footer/>
        </div>
    );
}

export default EditCar;

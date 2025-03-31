import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import DefaultLayout from '../components/DefultLayout';
import { deleteDriver, getAllDrivers } from '../redux/actions/driverActions';
import { Table, Button, Row, Col, DatePicker, message, Popconfirm } from 'antd';
import { Link } from 'react-router-dom';
import Spinner from '../components/Spinner';
import moment from 'moment';
import Footer from '../components/footer';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

function AdminDriver() {
    const { drivers } = useSelector(state => state.driversReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const [totalDrivers, setTotaldrivers] = useState([]);
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(getAllDrivers());
    }, [dispatch]);

    useEffect(() => {
        setTotaldrivers(drivers);
    }, [drivers]);

    const columns = [
        {
            title: 'Full Name',
            dataIndex: 'fullName',
            key: 'fullName',
            render: text => <a>{text}</a>,
        },
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: 'ID',
            dataIndex: '_id',
            key: '_id',
        },
        {
            title: 'Contact',
            dataIndex: 'phoneNumber',
            key: 'phoneNumber',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Gender',
            dataIndex: 'gender',
            key: 'gender',
        },
        {
            title: 'Date of Birth',
            dataIndex: 'dob',
            key: 'dob',
        },
        {
            title: 'Pincode',
            dataIndex: 'pincode',
            key: 'pincode',
        },
        {
            title: 'State',
            dataIndex: 'state',
            key: 'state',
        },
        {
            title: 'Address',
            dataIndex: 'address',
            key: 'address',
        },
        {
            title: 'Driving Licence Number',
            dataIndex: 'drivingLicenceNumber',
            key: 'drivingLicenceNumber',
        },
        {
            title: 'Password',
            dataIndex: 'password',
            key: 'password',
        },
        {
            title: 'Action',
            key: 'action',
            render: (text, driver) => (
                <div>
                    <Link to={`/editdriver/${driver._id}`}>
                        <EditOutlined className='mr-3' style={{ color: 'blue', cursor: 'pointer' }} />
                    </Link>
                    <Popconfirm
                        title="Delete the driver"
                        description="Are you sure to delete this driver?"
                        onConfirm={() => { dispatch(deleteDriver({ driverid: driver._id })) }}
                        okText="Yes"
                        cancelText="No"
                    >
                        <DeleteOutlined style={{ color: 'red', cursor: 'pointer' }} />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className='home'>
            <DefaultLayout />

            <Row justify='center' gutter={16} className='mt-2'>
                <Col lg={20} sm={24}>
                    <div className='text-right mb-5'>
                        <Button type="primary">
                            <Link to='/adddriver'>ADD Driver</Link>
                        </Button>
                    </div>
                </Col>
            </Row>

            {loading && <Spinner />}

            <Row justify='center' gutter={16}>
                <Col lg={20} sm={24}>
                    <Table dataSource={totalDrivers} columns={columns} rowKey='_id' />
                </Col>
            </Row>

            <Footer />
        </div>
    );
}

export default AdminDriver;

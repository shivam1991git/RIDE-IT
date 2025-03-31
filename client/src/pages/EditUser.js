import React, { useState, useEffect } from 'react';
import DefaultLayout from "../components/DefultLayout";
import { Col, Row, Form, Input } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { addUser, editUser, getAllUsers } from '../redux/actions/userActions';
import { useParams } from 'react-router-dom';
import Spinner from '../components/Spinner';
import Footer from '../components/footer';

function EditUser({ match }) {
    const { userid } = useParams();
    const { users } = useSelector(state => state.usersReducer);
    const { loading } = useSelector(state => state.alertsReducer);
    const dispatch = useDispatch();
    const [user, setUser] = useState(null);
    const [totalusers, settotalusers] = useState([])

    useEffect(() => {
        dispatch(getAllUsers());
    }, [dispatch]);

    useEffect(() => {
        if (users.length > 0) {
            settotalusers(users)
            const foundUser = users.find(o => o._id === userid);
            if (foundUser) {
                setUser(foundUser);
            }
        }
    }, [users, userid]);

    function onFinish(values) {
        values._id = user._id
        dispatch(editUser(values));

        console.log(values);
    }

    return (
        <div className='editcar'>
            <DefaultLayout>
                {loading && (<Spinner />)}
                <Row justify='center' className='mt-5'>
                    <Col lg={12} sm={24}>
                        {totalusers.length > 0 && (
                            <Form initialValues={user} className='bs1 p-2' layout='vertical' onFinish={onFinish}>
                                <h3>Edit User</h3>
                                {user.fullName}
                                {users.length}
                                <hr />
                                <Form.Item name='fullName' label='User name' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='username' label='user name' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='phoneNumber' label='Phone number' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='email' label='email' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='pincode' label='Pin code' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='state' label='state' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='address' label='Address' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name='password' label='Password' rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                                <div className='text-right'>
                                    <button type='submit' className='btn1'>Edit user</button>
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

export default EditUser;

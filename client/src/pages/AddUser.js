import React from 'react'
import DefaultLayout from "../components/DefultLayout"
import {Col, Row, Form, Input, Edit} from 'antd'
import {useDispatch , useSelector} from 'react-redux'
import {addUser} from '../redux/actions/userActions'
import Spinner from '../components/Spinner'
import Footer from '../components/footer';

function AddUser() {

    const dispatch = useDispatch()
    const {loading} = useSelector(state=>state.alertsReducer)

    function onFinish(values){

       
        dispatch(addUser(values))
        console.log(values)
    }
  return (
    <div className='home'>
    <DefaultLayout>
        {loading && (<Spinner />)}
        <Row justify='center mt-5'>
            <Col lg={12} sm={24}>
                <Form className='bs1 p-2'layout='vertical' onFinish={onFinish} style={{backgroundColor:'wheat'}}>
                    <h1>Add New user</h1>
                <hr/>
                    <Form.Item name='fullName' label='Full name' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='username' label='user name' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='phoneNumber' label='Phone number' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='email' label='email' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='pincode' label='Pin code' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='state' label='state' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='address' label='Address' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='password' label='Password' rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name='cpassword' label='Confirm Password'  dependencies={['password']} rules={[
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
                  <Input/>
            </Form.Item>
                    <div className='text-right'>
                    <button className='btn1'>Add User</button>
                    </div>
                </Form>
            </Col>
        </Row>
    </DefaultLayout>
    <Footer/>
    </div>
  )
}

export default AddUser
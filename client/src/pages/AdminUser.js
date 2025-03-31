import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux';
import DefultLayout from '../components/DefultLayout'
import { deleteUser, getAllUsers } from '../redux/actions/userActions';
import { Row, Col, DatePicker } from 'antd';
import { Link } from 'react-router-dom'
import Spinner from '../components/Spinner';
import {Popconfirm } from 'antd';
import Footer from '../components/footer';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker


function AdminUser() {
  const { users } = useSelector(state => state.usersReducer)
  const { loading } = useSelector(state => state.alertsReducer)
  const [totalUsers, setTotalusers] = useState([])
  const dispatch = useDispatch()


  useEffect(() => {
    dispatch(getAllUsers())
  }, [dispatch])

  useEffect(() => {
    setTotalusers(users)
  }, [users])

  return (
    <div className='home'>
      <DefultLayout />

      <Row justify='center' gutter={16} className='mt-2'>

        <Col lg={20} sm={24}>
          <div className='text-right mb-5'><button className='btn1'>
            <Link to='/adduser'>ADD User</Link>
          </button>
          </div>
        </Col>

      </Row>
      {loading == true && (<Spinner />)}

      <Row justify='center' gutter={16}>
        <Col lg={20} sm={24}>

          {totalUsers.map(user => {
            return <Row justify='center' gutter={16} className='bs1 mt-4 text-left'>
              <Col lg={18} sm={24}>





                <div className='text-left pl-2 mt-3 mb-2' style={{ color: 'black', backgroundColor: 'wheat', borderRadius: '8px' }}>
                  <h4 style={{ color: 'blue' }}>{user.fullName}</h4>
                  <p><strong>uaername:</strong> {user.username}</p>
                  <p><strong>id:</strong> {user._id}</p>
                  <p><strong>Email : </strong>{user.email}</p>
                  <p><strong>Conatact : </strong>{user.phoneNumber}</p>
                  <p><strong>Pin Code: </strong>{user.pincode}</p>
                  <p><strong>State: </strong>{user.state}</p>
                  <p><strong>Address : </strong>{user.address}</p>
                  <p><strong>Password : </strong>{user.password}</p>

                  <div className='mr-4 text-right'>
                    <Link to={`/edituser/${user._id}`}><EditOutlined className='mr-3' style={{ color: 'blue', cursor: 'pointer' }} />
                    </Link>


                    <Popconfirm
                      title="Delete the task"
                      description="Are you sure to delete this Car?"
                      onConfirm={() => { dispatch(deleteUser({ userid: user._id })) }}

                      okText="Yes"
                      cancelText="No"
                    >
                      <DeleteOutlined style={{ color: 'red', cursor: 'pointer' }} />
                    </Popconfirm>



                  </div>
                </div>

              </Col>
            </Row>
          })}
        </Col>
      </Row>
      <Footer />
    </div>

  )
}

export default AdminUser

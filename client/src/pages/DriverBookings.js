import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getAllBookings, confirmDriverBooking } from '../redux/actions/bookingActions';
import DefaultLayout from '../components/DefultLayout';
import Spinner from '../components/Spinner';
import { Table, Tag, Button, message } from 'antd';

function DriverBookings() {
  const { bookings } = useSelector(state => state.bookingsReducer);
  const { loading } = useSelector(state => state.alertsReducer);
  const dispatch = useDispatch();

  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    dispatch(getAllBookings());
  }, [dispatch]);

  const confirmBooking = (record) => {
    if (user && user._id) {
      dispatch(confirmDriverBooking(record._id, user._id));
    } else {
      message.error('User not found. Please log in.');
    }
  };

  const columns = [
    {
      title: 'User Name',
      dataIndex: 'user',
      render: (user) => user?.name || 'N/A',
    },
    {
      title: 'User Phone',
      dataIndex: 'user',
      render: (user) => user?.phone || 'N/A',
    },
    {
      title: 'Driver Name',
      dataIndex: 'driver',
      render: (driver) => driver?.name || 'N/A',
    },
    {
      title: 'Driver Phone',
      dataIndex: 'driver',
      render: (driver) => driver?.phone || 'N/A',
    },
    {
      title: 'Car',
      dataIndex: 'car',
      render: (car) => car?.name || 'N/A',
    },
    {
      title: 'Total Hours',
      dataIndex: 'totalHours',
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => {
        let color = status === 'Confirmed' ? 'green' : status === 'Driver Confirmation Pending' ? 'blue' : 'volcano';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Action',
      dataIndex: 'action',
      render: (text, record) => (
        <Button
          type="primary"
          onClick={() => confirmBooking(record)}
          disabled={record.status === 'Confirmed'}
        >
          Confirm Booking
        </Button>
      ),
    },
  ];

  return (
    <DefaultLayout>
      {loading && <Spinner />}
      <h3 className="text-center mt-2">Driver Bookings</h3>
      <Table
        columns={columns}
        dataSource={bookings.filter(b => b.driverRequired && (b.status === 'Driver Confirmation Pending' || b.status === 'Pending'))}
        rowKey="_id"
      />
    </DefaultLayout>
  );
}

export default DriverBookings;

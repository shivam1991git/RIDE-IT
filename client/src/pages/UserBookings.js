import React, { useEffect } from 'react';
import DefaultLayout from '../components/DefultLayout';
import { useDispatch, useSelector } from 'react-redux';
import { getAllBookings, cancelBooking } from '../redux/actions/bookingActions';
import { Table, Button, Spin } from 'antd';
import moment from 'moment';
import Footer from '../components/footer';

function UserBookings() {
  const dispatch = useDispatch();
  const { bookings } = useSelector(state => state.bookingsReducer);
  const { loading } = useSelector(state => state.alertsReducer);
  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    dispatch(getAllBookings());
  }, [dispatch]);

  const handleCancelBooking = (bookingId) => {
    dispatch(cancelBooking(bookingId));
  };

  const columns = [
    {
      title: 'Car Name',
      dataIndex: ['car', 'name'],
      key: 'carName',
    },
    {
      title: 'Total Hours',
      dataIndex: 'totalHours',
      key: 'totalHours',
    },
    {
      title: 'Rent per Hour',
      dataIndex: ['car', 'rentPerHour'],
      key: 'rentPerHour',
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
    },
    {
      title: 'Transaction Id',
      dataIndex: 'transactionId',
      key: 'transactionId',
    },
    {
      title: 'From',
      dataIndex: ['bookedTimeSlot', 'from'],
      key: 'from',
    },
    {
      title: 'To',
      dataIndex: ['bookedTimeSlot', 'to'],
      key: 'to',
    },
    {
      title: 'Date of Booking',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => moment(date).format('MM DD YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (text, record) => (
        record.status !== 'Cancelled' ? (
          <Button type='primary' onClick={() => handleCancelBooking(record._id)}>
            Cancel Booking
          </Button>
        ) : null
      ),
    },
    {
      title: 'Car Image',
      dataIndex: ['car', 'image'],
      key: 'carImage',
      render: (image) => <img style={{ borderRadius: 15 }} src={image} height='140' className='p-2' alt='car' />,
    },
  ];

  // Sort bookings by date of booking in descending order
  const sortedBookings = bookings
  
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((booking) => ({
      ...booking,
      key: booking._id,
    }));

  const dataSource = sortedBookings;

  return (
    <div style={{ backgroundColor: 'wheat' }}>
      <DefaultLayout>
        {loading ? (
          <Spin size="large" className="spinner" />
        ) : (
          <div style={{ margin: '20px' }}>
            <h3 className='text-center mt-5 mb-5'>My Bookings</h3>
            <Table columns={columns} dataSource={dataSource} pagination={false} bordered />
          </div>
        )}
      </DefaultLayout>
      <Footer></Footer>
    </div>

  );
}

export default UserBookings;

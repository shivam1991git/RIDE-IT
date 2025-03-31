import React, { useEffect } from 'react';
import DefaultLayout from '../components/DefultLayout';
import { useDispatch, useSelector } from 'react-redux';
import { getAllBookings, updateBookingStatus } from '../redux/actions/bookingActions';
import { Table, Select, Spin } from 'antd';
import moment from 'moment';
import  Footer  from '../components/footer';

const { Option } = Select;

function AdminBookings() {
  const dispatch = useDispatch();
  const { bookings } = useSelector(state => state.bookingsReducer);
  const { loading } = useSelector(state => state.alertsReducer);

  useEffect(() => {
    dispatch(getAllBookings());
  }, [dispatch]);

  const handleStatusChange = (bookingId, value) => {
    dispatch(updateBookingStatus(bookingId, value));
  };

  const columns = [
    {
      title: 'Car',
      dataIndex: 'car',
      key: 'car',
      render: (car) => <span>{car.name}</span>,
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
      render: (date) => <span>{moment(date).format('MM DD YYYY')}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => (
        <Select
          defaultValue={status}
          onChange={(value) => handleStatusChange(record._id, value)}
          style={{ width: 120 }}
        >
          <Option value="Pending">Pending</Option>
          <Option value="Confirmed">Confirmed</Option>
          <Option value="Cancelled">Cancelled</Option>
        </Select>
      ),
    },
    {
      title: 'Car Image',
      dataIndex: 'car',
      key: 'carImage',
      render: (car) => (
        <img
          src={car.image}
          alt="car"
          style={{ borderRadius: 15 }}
          height="140"
          className="p-2"
        />
      ),
    },
  ];

  const sortedBookings = bookings
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .map((booking) => ({
    ...booking,
    key: booking._id,
  }));
 const dataSource = sortedBookings;
  return (
    <div style={{backgroundColor:'wheat'}} >
    <DefaultLayout>
      {loading ? (
        <Spin size="large" className="spinner" />
      ) : (
        <div style={{ margin: '20px' }}>
          <h2 className="text-center mt-3 mb-5">All Bookings</h2>
          <Table 
            columns={columns}
            dataSource={dataSource}
            pagination={false}
            bordered
          />
        </div>
      )}
    </DefaultLayout>
    <Footer></Footer>
    </div>
  
  );
}

export default AdminBookings;

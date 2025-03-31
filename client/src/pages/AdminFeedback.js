import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getAllFeedback } from '../redux/actions/feedbackActions';
import DefaultLayout from '../components/DefultLayout';
import Spinner from '../components/Spinner';

const AdminFeedback = () => {
  const dispatch = useDispatch();
  const { feedbacks, error } = useSelector(state => state.feedbackReducer);
  const { loading } = useSelector(state => state.alertsReducer);
  const [totalFeedback, setTotalFeedback] = useState([]);

  useEffect(() => {
    dispatch(getAllFeedback());
  }, [dispatch]);

  useEffect(() => {
    if (feedbacks && Array.isArray(feedbacks)) {
      setTotalFeedback(feedbacks);
    }
  }, [feedbacks]);

  return (
    <DefaultLayout>
      {loading && <Spinner />}
      <div className="container">
        <h1>All Feedback</h1>
        {loading ? (
          <div>Loading...</div>
         )
        //  : error ? (
        //   <div>Error: {error}</div>
        // )
         : (
          <table className="table">
            <thead>
              <tr>
                <th>User/Driver ID</th>
                <th>Username</th>
                <th>Car Quality</th>
                <th>Driver Behavior</th>
                <th>User Behavior</th>
                <th>App Rating</th>
                <th>Comments</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {totalFeedback.map((fb) => (
                <tr key={fb._id}>
                  <td>{fb.userId ? fb.userId._id : 'N/A'}</td>
                  <td>{fb.userId ? fb.userId.username : 'N/A'}</td>
                  <td>{fb.carQuality}</td>
                  <td>{fb.driverBehavior}</td>
                  <td>{fb.userBehavior}</td>
                  <td>{fb.appRating}</td>
                  <td>{fb.additionalComments}</td>
                  <td>{new Date(fb.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DefaultLayout>
  );
};

export default AdminFeedback;

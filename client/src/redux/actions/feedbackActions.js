import axios from 'axios';

export const getAllFeedback = () => async (dispatch) => {
  dispatch({ type: 'GET_ALL_FEEDBACK_REQUEST' });

  try {
    const response = await axios.get('/api/feedbacks/getallfeedbacks');
    dispatch({
      type: 'GET_ALL_FEEDBACK_SUCCESS',
      payload: response.data
    });
  } catch (error) {
    dispatch({
      type: 'GET_ALL_FEEDBACK_FAILED',
      payload: error.message
    });
  }
};

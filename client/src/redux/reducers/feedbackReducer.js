const initialState = {
    feedbacks: [],
    loading: false,
    error: null,
  };
  
  export const feedbackReducer = (state = initialState, action) => {
    switch (action.type) {
      case 'GET_ALL_FEEDBACK_REQUEST':
        return { ...state, loading: true };
      case 'GET_ALL_FEEDBACK_SUCCESS':
        return { ...state, loading: false, feedbacks: action.payload, error: null };
      case 'GET_ALL_FEEDBACK_FAILED':
        return { ...state, loading: false, error: action.payload };
      default:
        return state;
    }
  };
  